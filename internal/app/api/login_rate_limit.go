package api

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	loginMaxFailures     = 5
	loginFailureWindow   = 5 * time.Minute
	loginAttemptCapacity = 4096
)

type loginAttempt struct {
	failures int
	resetAt  time.Time
}

type loginRateLimiter struct {
	mu       sync.Mutex
	attempts map[string]loginAttempt
	now      func() time.Time
}

func loginRateLimitKey(r *http.Request, username string) string {
	remote := strings.TrimSpace(requestPeer(r))
	if remote == "" {
		remote = "unknown"
	}
	return remote + "\x00" + strings.ToLower(strings.TrimSpace(username))
}

func (l *loginRateLimiter) allowed(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.clock()
	attempt, ok := l.attempts[key]
	if !ok {
		l.removeExpired(now)
		return len(l.attempts) < loginAttemptCapacity
	}
	if !now.Before(attempt.resetAt) {
		delete(l.attempts, key)
		return true
	}
	return attempt.failures < loginMaxFailures
}

func (l *loginRateLimiter) recordFailure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.clock()
	attempt, ok := l.attempts[key]
	if ok && !now.Before(attempt.resetAt) {
		delete(l.attempts, key)
		ok = false
	}
	if !ok && len(l.attempts) >= loginAttemptCapacity {
		l.removeExpired(now)
		if len(l.attempts) >= loginAttemptCapacity {
			return
		}
	}
	attempt.failures++
	attempt.resetAt = now.Add(loginFailureWindow)
	if l.attempts == nil {
		l.attempts = make(map[string]loginAttempt)
	}
	l.attempts[key] = attempt
}

func (l *loginRateLimiter) removeExpired(now time.Time) {
	for key, attempt := range l.attempts {
		if !now.Before(attempt.resetAt) {
			delete(l.attempts, key)
		}
	}
}

func (l *loginRateLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

func (l *loginRateLimiter) clock() time.Time {
	if l.now != nil {
		return l.now()
	}
	return time.Now()
}

func writeLoginRateLimited(w http.ResponseWriter) {
	w.Header().Set("Retry-After", strconv.Itoa(int(loginFailureWindow.Seconds())))
	writeError(w, http.StatusTooManyRequests, "too many login attempts; try again later")
}

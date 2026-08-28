package api

import (
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func TestLoginRateLimiterBlocksRepeatedFailures(t *testing.T) {
	now := time.Date(2026, time.July, 25, 0, 0, 0, 0, time.UTC)
	limiter := loginRateLimiter{now: func() time.Time { return now }}

	for range loginMaxFailures {
		limiter.recordFailure("192.0.2.1\x00admin")
	}
	if limiter.allowed("192.0.2.1\x00admin") {
		t.Fatal("expected repeated failures to block login")
	}

	now = now.Add(loginFailureWindow)
	if !limiter.allowed("192.0.2.1\x00admin") {
		t.Fatal("expected limiter to expire")
	}
}

func TestLoginRateLimiterResetsAfterSuccess(t *testing.T) {
	limiter := loginRateLimiter{}
	for range loginMaxFailures - 1 {
		limiter.recordFailure("192.0.2.1\x00admin")
	}
	limiter.reset("192.0.2.1\x00admin")
	if !limiter.allowed("192.0.2.1\x00admin") {
		t.Fatal("expected successful login to clear failures")
	}
}

func TestLoginRateLimitKeyNormalizesUsername(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/auth/login", nil)
	req.RemoteAddr = "192.0.2.1:1234"
	req.Header.Set("X-Forwarded-For", "198.51.100.1")
	if got, want := loginRateLimitKey(req, " Admin "), "192.0.2.1\x00admin"; got != want {
		t.Fatalf("loginRateLimitKey() = %q, want %q", got, want)
	}
}

func TestLoginRateLimiterFailsClosedAtCapacity(t *testing.T) {
	limiter := loginRateLimiter{}
	for i := range loginAttemptCapacity {
		limiter.recordFailure("192.0.2.1\x00user" + strconv.Itoa(i))
	}
	if limiter.allowed("192.0.2.1\x00new-user") {
		t.Fatal("expected a new key to be blocked while the limiter is full")
	}
}

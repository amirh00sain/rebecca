package api

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAPIRequestBodyLimitRejectsLargeDeclaredBody(t *testing.T) {
	handler := withAPIRequestBodyLimit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not receive an oversized body")
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/users", strings.NewReader("x"))
	req.ContentLength = maxAPIRequestBodyBytes + 1
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, req)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusRequestEntityTooLarge)
	}
}

func TestAPIRequestBodyLimitCapsUndeclaredBody(t *testing.T) {
	var readErr error
	handler := withAPIRequestBodyLimit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, readErr = io.ReadAll(r.Body)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/users", strings.NewReader(strings.Repeat("x", int(maxAPIRequestBodyBytes+1))))
	req.ContentLength = -1

	handler.ServeHTTP(httptest.NewRecorder(), req)
	var maxBytesErr *http.MaxBytesError
	if !errors.As(readErr, &maxBytesErr) {
		t.Fatalf("read error = %v, want MaxBytesError", readErr)
	}
}

func TestAPIRequestBodyLimitKeepsBackupImportException(t *testing.T) {
	called := false
	handler := withAPIRequestBodyLimit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/settings/backup/import", strings.NewReader("x"))
	req.ContentLength = maxAPIRequestBodyBytes + 1

	handler.ServeHTTP(httptest.NewRecorder(), req)
	if !called {
		t.Fatal("backup import should use its dedicated 128 MiB limit")
	}
}

func TestAPIRequestBodyLimitAllowsPHPMyAdminGigabyteUploads(t *testing.T) {
	called := false
	handler := withAPIRequestBodyLimit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	req := httptest.NewRequest(http.MethodPost, phpMyAdminEmbedPath+"import.php", strings.NewReader("x"))
	req.ContentLength = maxPHPMyAdminRequestBodyBytes

	handler.ServeHTTP(httptest.NewRecorder(), req)
	if !called {
		t.Fatal("phpMyAdmin upload at the 1 GiB limit should reach the proxy")
	}
}

func TestAPIRequestBodyLimitRejectsOversizedPHPMyAdminUpload(t *testing.T) {
	handler := withAPIRequestBodyLimit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not receive an oversized phpMyAdmin upload")
	}))
	req := httptest.NewRequest(http.MethodPost, phpMyAdminEmbedPath+"import.php", strings.NewReader("x"))
	req.ContentLength = maxPHPMyAdminRequestBodyBytes + 1
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, req)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusRequestEntityTooLarge)
	}
}

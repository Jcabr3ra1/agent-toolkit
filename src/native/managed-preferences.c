#include <stdio.h>
#include "managed-preferences.h"

#ifndef N1_SYNTHETIC_BACKEND
#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>

int n1_copy(const char *key, const char *application, void **value) {
    CFStringRef k = CFStringCreateWithCString(NULL, key, kCFStringEncodingUTF8);
    CFStringRef app = CFStringCreateWithCString(NULL, application, kCFStringEncodingUTF8);
    if (k == NULL || app == NULL) {
        if (k != NULL) CFRelease(k);
        if (app != NULL) CFRelease(app);
        *value = NULL;
        return 0;
    }
    *value = (void *)CFPreferencesCopyAppValue(k, app);
    CFRelease(k);
    CFRelease(app);
    return 1;
}

enum n1_kind n1_type(const void *value) {
    CFTypeID type = CFGetTypeID((CFTypeRef)value);
    if (type == CFBooleanGetTypeID()) return N1_BOOLEAN;
    if (type == CFNumberGetTypeID()) return N1_NUMBER;
    if (type == CFStringGetTypeID()) return N1_STRING;
    if (type == CFArrayGetTypeID()) return N1_ARRAY;
    if (type == CFDictionaryGetTypeID()) return N1_DICTIONARY;
    return N1_OTHER;
}

void n1_release(void *value) { CFRelease((CFTypeRef)value); }

int n1_forced(const char *key, const char *application, int *forced) {
    CFStringRef k = CFStringCreateWithCString(NULL, key, kCFStringEncodingUTF8);
    CFStringRef app = CFStringCreateWithCString(NULL, application, kCFStringEncodingUTF8);
    if (k == NULL || app == NULL) {
        if (k != NULL) CFRelease(k);
        if (app != NULL) CFRelease(app);
        return 0;
    }
    *forced = CFPreferencesAppValueIsForced(k, app) ? 1 : 0;
    CFRelease(k);
    CFRelease(app);
    return 1;
}

int n1_complete(void) { return 1; }
#else
#error "Core Foundation backend requires macOS"
#endif
#define N1_SOURCE "core-foundation-claim"
#else
#define N1_SOURCE "synthetic"
#endif

static const char *const keys[N1_FIELD_COUNT] = {
    "hooks", "policyHelper", "apiKeyHelper", "env", "managedMcpServers", "disableAllHooks"
};
static const char *const types[] = {
    "not-found-by-api", "boolean", "number", "string", "array", "dictionary", "other"
};

static int failure(const char *code) {
    /* Callers only pass internal literal codes. No values/paths/errors are printed. */
    int written = printf("{\"schemaVersion\":\"1.0.0\",\"source\":\"%s\",\"status\":\"failed\",\"code\":\"%s\"}\n", N1_SOURCE, code);
    if (written < 0 || fflush(stdout) != 0) return 2;
    return 1;
}

int main(int argc, char **argv) {
    enum n1_kind kind[N1_FIELD_COUNT];
    int forced[N1_FIELD_COUNT];
    (void)argv;
    if (argc != 1) return failure("preferences-arguments-rejected");
    for (int i = 0; i < N1_FIELD_COUNT; i++) {
        void *value = NULL;
        if (!n1_copy(keys[i], N1_APPLICATION, &value)) {
            if (value != NULL) n1_release(value);
            return failure("preferences-backend-failed");
        }
        int found = value != NULL;
        kind[i] = found ? n1_type(value) : N1_NOT_FOUND;
        if (value != NULL) n1_release(value);
        if (kind[i] < N1_NOT_FOUND || kind[i] > N1_OTHER || (found && kind[i] == N1_NOT_FOUND))
            return failure("preferences-type-rejected");
        /* Release the value before asking forced status or advancing to another key. */
        if (!n1_forced(keys[i], N1_APPLICATION, &forced[i]) || forced[i] < 0 || forced[i] > 1)
            return failure("preferences-backend-failed");
    }
    if (!n1_complete()) return failure("preferences-backend-failed");
    if (printf("{\"schemaVersion\":\"1.0.0\",\"source\":\"%s\",\"application\":\"%s\",\"status\":\"complete\",\"fields\":[", N1_SOURCE, N1_APPLICATION) < 0) return 2;
    for (int i = 0; i < N1_FIELD_COUNT; i++) {
        if (printf("%s{\"name\":\"%s\",\"type\":\"%s\",\"forced\":\"%s\"}", i == 0 ? "" : ",",
                   keys[i], types[kind[i]], forced[i] ? "forced" : "not-forced") < 0) return 2;
    }
    if (printf("]}\n") < 0 || fflush(stdout) != 0) return 2;
    return 0;
}

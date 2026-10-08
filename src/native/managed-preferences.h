#ifndef AGENT_MANAGED_PREFERENCES_H
#define AGENT_MANAGED_PREFERENCES_H

/* This interface is linked at build time, never selected by argv or settings. */
#define N1_APPLICATION "com.anthropic.claudecode"
#define N1_FIELD_COUNT 6
enum n1_kind {
    N1_NOT_FOUND = 0, N1_BOOLEAN, N1_NUMBER, N1_STRING,
    N1_ARRAY, N1_DICTIONARY, N1_OTHER
};
int n1_copy(const char *key, const char *application, void **value);
enum n1_kind n1_type(const void *value);
void n1_release(void *value);
int n1_forced(const char *key, const char *application, int *forced);
int n1_complete(void);

#endif

#include <stdlib.h>
#include <string.h>
#include "../../src/native/managed-preferences.h"

#ifndef N1_SCENARIO
#define N1_SCENARIO 0
#endif

/* No Core Foundation link or filesystem access: tests cannot query real preferences. */
struct fake_value { enum n1_kind kind; const char *secret; };
static struct fake_value values[N1_FIELD_COUNT] = {
    { N1_DICTIONARY, "synthetic-private-command" }, { N1_STRING, "synthetic-private-helper" },
    { N1_STRING, "synthetic-private-credential" }, { N1_DICTIONARY, "synthetic-private-env" },
    { N1_ARRAY, "synthetic-private-endpoint" }, { N1_BOOLEAN, "synthetic-private-false" }
};
static const char *const expected[N1_FIELD_COUNT] = {
    "hooks", "policyHelper", "apiKeyHelper", "env", "managedMcpServers", "disableAllHooks"
};
static int copies = 0, releases = 0, forces = 0, live = 0;
static void verify_cleanup(void) { if (live != 0) _Exit(95); }

int n1_copy(const char *key, const char *application, void **value) {
    if (copies == 0 && atexit(verify_cleanup) != 0) exit(96);
    if (copies >= N1_FIELD_COUNT || live != 0 || forces != copies ||
        strcmp(key, expected[copies]) != 0 || strcmp(application, N1_APPLICATION) != 0) exit(90);
    int index = copies++;
    *value = NULL;
    if (N1_SCENARIO == 2 && index == 2) return 0;
    if (N1_SCENARIO == 1) return 1;
    if (N1_SCENARIO == 8 && index == 1) return 1;
    if (N1_SCENARIO == 5) values[index].kind = N1_OTHER;
    if (N1_SCENARIO == 6) values[index].kind = N1_NUMBER;
    if (N1_SCENARIO == 7) values[index].kind = (enum n1_kind)99;
    if (N1_SCENARIO == 12) values[index].kind = N1_NOT_FOUND;
    *value = &values[index]; live = 1;
    if (N1_SCENARIO == 9 && index == 2) return 0; /* Failure with owned value must release. */
    return 1;
}

enum n1_kind n1_type(const void *value) {
    if (live != 1 || value != &values[copies - 1]) exit(91);
    return ((const struct fake_value *)value)->kind;
}

void n1_release(void *value) {
    if (live != 1 || value != &values[copies - 1]) exit(92);
    releases++; live = 0;
}

int n1_forced(const char *key, const char *application, int *forced) {
    if (live != 0 || forces >= N1_FIELD_COUNT || copies != forces + 1 ||
        strcmp(key, expected[forces]) != 0 || strcmp(application, N1_APPLICATION) != 0) exit(93);
    int index = forces++;
    if (N1_SCENARIO == 3 && index == 3) return 0;
    *forced = N1_SCENARIO == 4 ? 0 : index % 2;
    if (N1_SCENARIO == 10) *forced = 2;
    return 1;
}

int n1_complete(void) {
    int expected_releases = N1_SCENARIO == 1 ? 0 : N1_SCENARIO == 8 ? 5 : N1_FIELD_COUNT;
    if (copies != N1_FIELD_COUNT || forces != N1_FIELD_COUNT || live != 0 || releases != expected_releases) exit(94);
    return N1_SCENARIO == 11 ? 0 : 1;
}

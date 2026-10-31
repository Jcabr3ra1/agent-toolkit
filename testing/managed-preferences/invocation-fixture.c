#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>

#ifndef N1_TRANSPORT_MODE
#define N1_TRANSPORT_MODE 0
#endif
/* Transport adversaries only: no Core Foundation or real preferences. */
static const char wire[] = "{\"schemaVersion\":\"1.0.0\",\"source\":\"synthetic\",\"application\":\"com.anthropic.claudecode\",\"status\":\"complete\",\"fields\":[{\"name\":\"hooks\",\"type\":\"dictionary\",\"forced\":\"not-forced\"},{\"name\":\"policyHelper\",\"type\":\"not-found-by-api\",\"forced\":\"not-forced\"},{\"name\":\"apiKeyHelper\",\"type\":\"not-found-by-api\",\"forced\":\"not-forced\"},{\"name\":\"env\",\"type\":\"dictionary\",\"forced\":\"not-forced\"},{\"name\":\"managedMcpServers\",\"type\":\"array\",\"forced\":\"not-forced\"},{\"name\":\"disableAllHooks\",\"type\":\"boolean\",\"forced\":\"not-forced\"}]}\n";
int main(int argc, char **argv) {
    (void)argv;
    if (argc != 1 || getchar() != EOF || getenv("ANTHROPIC_API_KEY") || getenv("GEMINI_API_KEY") || getenv("DYLD_INSERT_LIBRARIES") || getenv("NODE_OPTIONS")) return 73;
    if (N1_TRANSPORT_MODE == 1 || N1_TRANSPORT_MODE == 2) {
        if (N1_TRANSPORT_MODE == 2) signal(SIGTERM, SIG_IGN);
        for (;;) pause();
    }
    if (N1_TRANSPORT_MODE == 3 || N1_TRANSPORT_MODE == 4) {
        FILE *out = N1_TRANSPORT_MODE == 3 ? stdout : stderr;
        for (;;) { fputs("synthetic-private-data", out); fflush(out); }
    }
    if (N1_TRANSPORT_MODE == 5) { putchar(255); return 0; }
    if (N1_TRANSPORT_MODE == 6) { puts("{\"source\":\"synthetic\",\"source\":\"synthetic\"}"); return 0; }
    if (N1_TRANSPORT_MODE == 9) { puts("{\"schemaVersion\":\"1.0.0\",\"source\":\"synthetic\",\"status\":\"failed\",\"code\":\"preferences-backend-failed\"}"); return 1; }
    fputs(wire, stdout); fflush(stdout);
    if (N1_TRANSPORT_MODE == 7) return 2;
    if (N1_TRANSPORT_MODE == 8) { signal(SIGTERM, SIG_IGN); for (;;) pause(); }
    if (N1_TRANSPORT_MODE == 10) {
        pid_t child = fork(); if (child < 0) return 74;
        if (child == 0) { close(0); close(1); close(2); for (;;) pause(); }
    }
    if (N1_TRANSPORT_MODE == 11) { FILE *out = fopen("synthetic-residual", "wb"); if (out == NULL) return 75; fputs("synthetic-private", out); fclose(out); }
    return 0;
}

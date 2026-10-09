#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <time.h>

#ifndef AD_MODE
#define AD_MODE 0
#endif

/* Entirely fictitious transport. No client, network, settings or account API. */
int main(int argc, char **argv) {
  if (argc != 3 || strcmp(argv[1], "auth") || strcmp(argv[2], "status")) return 77;
  const char *ok = "{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"subscriptionType\":\"pro\",\"email\":\"synthetic-private\",\"configDirectory\":\"/synthetic-private\"}\n";
  switch (AD_MODE) {
    case 1: puts("{\"loggedIn\":false,\"authMethod\":\"none\"}"); return 1;
    case 2: fputs(ok, stdout); return 1;
    case 3: fputs("{\"loggedIn\":true", stdout); return 0;
    case 4: fputs(ok, stdout); fputs("synthetic-private", stderr); return 0;
    case 5: for (int i = 0; i < 40000; i++) putchar(' '); return 0;
    case 6: for (int i = 0; i < 40000; i++) fputc('x', stderr); return 0;
    case 7: signal(SIGTERM, SIG_IGN); for (;;) pause();
    case 8: fputs(ok, stdout); fflush(stdout); for (;;) pause();
    case 9: {
      FILE *f = fopen("synthetic-residue", "w"); if (!f) return 78;
      fputs("synthetic-private", f); fclose(f); fputs(ok, stdout); return 0;
    }
    case 10: {
      pid_t child = fork(); if (child < 0) return 79;
      if (child == 0) { for (;;) pause(); }
      fputs(ok, stdout); return 0;
    }
    case 11: close(STDOUT_FILENO); close(STDERR_FILENO); for (;;) pause();
    case 12: puts("{\"loggedIn\":true,\"authMethod\":\"none\",\"discarded\":{\"x\":1,\"x\":2}}"); return 0;
    case 13: puts(" "); return 0;
    case 14: puts("{\"logg\\u0065dIn\":true,\"authMethod\":\"claude.ai\",\"subscriptionType\":null,\"discarded\":[\"\\ud83d\\ude00\",{\"authMethod\":\"secret\"},-1.2e+30]}"); return 0;
    case 15: puts("{\"loggedIn\":true,\"authMethod\":\"api_key\",\"subscriptionType\":\"pro\"}"); return 0;
    case 16: puts("{\"loggedIn\":true,\"authMethod\":\"claude.ai\"}"); return 0;
    case 17: puts("{\"loggedIn\":true,\"authMethod\":\"none\",\"discarded\":01}"); return 0;
    case 18: fputs(ok, stdout); fputs(ok, stdout); return 0;
    case 19: fputs("{\"loggedIn\":true,\"authMethod\":\"none\",\"discarded\":\"", stdout); fputc(0xc0, stdout); fputc(0x80, stdout); puts("\"}"); return 0;
    case 20: {
      struct timespec tick = {0, 1000000};
      for (size_t i = 0; i < strlen(ok); i++) { putchar(ok[i]); fflush(stdout); nanosleep(&tick, NULL); }
      return 0;
    }
    case 21: fputs(ok, stdout); return 2;
    case 22: fputs(ok, stdout); fflush(stdout); raise(SIGTERM); return 0;
    default: fputs(ok, stdout); return 0;
  }
}

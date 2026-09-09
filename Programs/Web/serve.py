#!/usr/bin/env python3
"""CALM — local development server.

    Programs/Web/serve.py            # http://127.0.0.1:8000/
    Programs/Web/serve.py 8080       # another port

Identical to `python3 -m http.server` but for one thing: it tells the browser
never to cache anything.

That one thing matters more than it sounds. The application is built from ES
modules, which browsers cache hard, and the stock server answers 304 Not
Modified from a timestamp. Edit three modules, reload, and you can end up
running a mix of old and new — an interface whose behaviour matches no version
of the code you have on disk. It looks exactly like a bug, and it wastes an
afternoon.

For serving the built site (the static subdomain) the stock server, or any
other, is fine: caching is only a nuisance while the files keep changing.
"""

import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(NoCacheHandler, directory=str(ROOT))

    server = HTTPServer(("127.0.0.1", port), handler)
    print(f"CALM sur http://127.0.0.1:{port}/  (Ctrl+C pour arrêter)")
    print("Aucune mise en cache : un simple rechargement suffit après chaque édition.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()

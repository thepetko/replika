"""Dvojklikový lokálny spúšťač aplikácie pre Windows."""

from __future__ import annotations

import os
import threading
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
SOURCE_DIR = PROJECT_DIR / "src"
DEFAULT_PORT = 8000
LAST_PORT = 8010


class AppRequestHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


def create_server(test_mode: bool = False) -> ThreadingHTTPServer:
    handler = partial(AppRequestHandler, directory=str(SOURCE_DIR))
    ports = [0] if test_mode else range(DEFAULT_PORT, LAST_PORT + 1)

    for port in ports:
        try:
            return ThreadingHTTPServer(("127.0.0.1", port), handler)
        except OSError:
            continue

    raise RuntimeError(
        f"Nenašiel sa voľný port v rozsahu {DEFAULT_PORT}–{LAST_PORT}."
    )


def verify_server(server: ThreadingHTTPServer) -> None:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]

    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=5) as response:
            html = response.read().decode("utf-8")
        if response.status != 200 or 'type="module" src="app.js"' not in html:
            raise RuntimeError("Kontrolné načítanie aplikácie zlyhalo.")
    finally:
        server.shutdown()
        thread.join(timeout=5)


def main() -> int:
    test_mode = os.environ.get("REPLIKA_LAUNCHER_TEST") == "1"

    try:
        server = create_server(test_mode=test_mode)
    except (OSError, RuntimeError) as error:
        print(f"\nAplikáciu sa nepodarilo spustiť: {error}")
        return 1

    if test_mode:
        try:
            verify_server(server)
        except (OSError, RuntimeError, urllib.error.URLError) as error:
            print(f"Kontrola spúšťača zlyhala: {error}")
            return 1
        finally:
            server.server_close()
        print("Kontrola spúšťača prešla.")
        return 0

    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    print("\nAplikácia je spustená.")
    print(f"Ak sa prehliadač neotvoril automaticky, otvorte: {url}")
    print("Toto okno nechajte otvorené. Server ukončíte klávesmi Ctrl+C.")
    webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAplikácia bola zastavená.")
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

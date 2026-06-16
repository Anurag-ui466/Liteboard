# Multi-threaded static server for web/ with caching disabled (edits always show on reload).
import http.server, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "web"))
class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"   # keep-alive; threaded server handles parallel requests
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, *a): pass
PORT = 5510
httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
httpd.daemon_threads = True
print("LiteBoard serving (threaded, no-cache) on http://localhost:%d" % PORT)
httpd.serve_forever()

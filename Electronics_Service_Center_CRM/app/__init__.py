import logging
import datetime
import os
from decimal import Decimal
from flask import Flask, jsonify, url_for, request
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config
from .db import close_conn

limiter = Limiter(key_func=get_remote_address, default_limits=["2000 per hour"])


class CleanJSONProvider(DefaultJSONProvider):
    """Flask's default JSON encoding turns a Python date into something like
    "Mon, 31 Aug 2026 00:00:00 GMT" — fine for HTTP headers, useless (and
    actively broken for <input type="date">) as data. This makes every
    date/datetime/Decimal value serialize as a clean, ordinary value instead,
    everywhere in the API at once, rather than needing a fix in every route."""
    @staticmethod
    def default(obj):
        if isinstance(obj, datetime.datetime):
            return obj.strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(obj, datetime.date):
            return obj.isoformat()  # "2026-08-31"
        if isinstance(obj, Decimal):
            return float(obj)
        return DefaultJSONProvider.default(obj)


def create_app():
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    app.json = CleanJSONProvider(app)
    app.config.from_object(Config())
    # Hard ceiling on any single request body — mainly relevant for image
    # uploads. A little above S3_MAX_UPLOAD_MB so the app's own "file too
    # large" message (checked per-file in the upload route) fires first,
    # with this as the last-resort backstop.
    app.config["MAX_CONTENT_LENGTH"] = (app.config["S3_MAX_UPLOAD_MB"] + 2) * 1024 * 1024

    # Cache-busting for static JS/CSS: without this, browsers can keep
    # serving old JavaScript/CSS indefinitely after a deploy — the
    # exact "I updated the code but the browser is still showing the old
    # thing" problem. asset_url() appends the file's own last-modified
    # time as a query string, so the URL itself changes the moment the
    # file actually changes, forcing a fresh fetch automatically instead
    # of relying on a hard-refresh every time.
    @app.template_global()
    def asset_url(filename):
        filepath = os.path.join(app.static_folder, filename)
        try:
            v = int(os.path.getmtime(filepath))
        except OSError:
            v = 0
        return url_for("static", filename=filename) + f"?v={v}"

    # CORS: only the origins you explicitly allow — never "*" once real data
    # is involved, since that would let any website read a logged-in user's data.
    CORS(app, origins=app.config["ALLOWED_ORIGINS"] or [], supports_credentials=False)

    limiter.init_app(app)

    app.teardown_appcontext(close_conn)

    # Security headers on every response
    @app.after_request
    def set_security_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        if app.config["IS_PRODUCTION"]:
            resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return resp

    # Never leak stack traces or internal errors to the client
    from werkzeug.exceptions import HTTPException

    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        # Expected HTTP errors are logged without application stack traces.
        app.logger.info("HTTP %s: %s %s", e.code, request.method, request.path)
        return jsonify({"error": e.description}), e.code

    @app.errorhandler(Exception)
    def handle_uncaught(e):
        app.logger.exception("Unhandled exception")
        return jsonify({"error": "Internal server error"}), 500

    if not app.config["IS_PRODUCTION"]:
        logging.basicConfig(level=logging.INFO)

    from .routes.auth import auth_bp
    from .routes.calls import calls_bp
    from .routes.purchases import purchases_bp
    from .routes.inventory import inventory_bp
    from .routes.cashbook import cashbook_bp
    from .routes.lists import lists_bp
    from .routes.settings import settings_bp
    from .routes.audit import audit_bp
    from .routes.pages import pages_bp
    from .routes.uploads import uploads_bp

    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(calls_bp, url_prefix="/api/calls")
    app.register_blueprint(purchases_bp, url_prefix="/api/purchases")
    app.register_blueprint(inventory_bp, url_prefix="/api/inventory")
    app.register_blueprint(cashbook_bp, url_prefix="/api/cashbook")
    app.register_blueprint(lists_bp, url_prefix="/api/lists")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")
    app.register_blueprint(audit_bp, url_prefix="/api/audit-log")
    app.register_blueprint(pages_bp)
    app.register_blueprint(uploads_bp, url_prefix="/api/uploads")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app

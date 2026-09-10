from datetime import timedelta

from flask import Flask, jsonify, render_template

from config import SECRET_KEY
from routes.analytics import analytics_bp
from routes.auth import auth_bp
from routes.campaigns import campaigns_bp
from routes.geocode import geocode_bp
from routes.notifications import notifications_bp
from routes.profile import profile_bp
from routes.reports import reports_bp

app = Flask(__name__)
app.secret_key = SECRET_KEY

# Cap request body at 8MB to prevent memory exhaustion from large uploads.
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

app.register_blueprint(auth_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(campaigns_bp)
app.register_blueprint(geocode_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(profile_bp)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/status")
def status():
    return {"status": "SeaKeepers backend is running"}


# --- Error handlers ---
# Return JSON instead of default HTML

@app.errorhandler(413)
def handle_too_large(e):
    return jsonify({"error": "That file is too large (8MB limit)."}), 413


@app.errorhandler(404)
def handle_not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def handle_server_error(e):
    app.logger.error(f"Unhandled error: {e}")
    return jsonify({"error": "Something went wrong on our end. Please try again."}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)

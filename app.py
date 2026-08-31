from flask import Flask, render_template
from routes.notifications import notifications_bp
from routes.profile import profile_bp

from config import SECRET_KEY
from routes.analytics import analytics_bp
from routes.auth import auth_bp
from routes.campaigns import campaigns_bp
from routes.geocode import geocode_bp
from routes.reports import reports_bp

app = Flask(__name__)
app.secret_key = SECRET_KEY

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


if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)

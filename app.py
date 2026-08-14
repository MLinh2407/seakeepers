from flask import Flask

from config import SECRET_KEY
from routes.auth import auth_bp
from routes.campaigns import campaigns_bp
from routes.reports import reports_bp

app = Flask(__name__)
app.secret_key = SECRET_KEY

app.register_blueprint(auth_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(campaigns_bp)


@app.route("/")
def index():
    return {"status": "SeaKeepers backend is running"}


if __name__ == "__main__":
    app.run(debug=True, port=5000)

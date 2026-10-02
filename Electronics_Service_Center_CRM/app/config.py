import os

class Config:
    MYSQLHOST = os.environ["MYSQLHOST"]
    MYSQLPORT = int(os.environ.get("MYSQLPORT", 3306))
    MYSQLUSER = os.environ["MYSQLUSER"]
    MYSQLPASSWORD = os.environ["MYSQLPASSWORD"]
    MYSQLDATABASE = os.environ["MYSQLDATABASE"]

    JWT_SECRET = os.environ["JWT_SECRET"]
    JWT_ALGO = "HS256"

    ALLOWED_ORIGINS = [
        o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()
    ]

    # Optional on purpose: the app must keep working while the bucket is
    # still being set up. The upload endpoint checks these itself and
    # returns a clear error if they're missing — it doesn't crash the whole
    # app at startup like the required MySQL/JWT settings above do.
    S3_BUCKET = os.environ.get("S3_BUCKET", "")
    S3_REGION = os.environ.get("S3_REGION", "ap-south-1")
    S3_MAX_UPLOAD_MB = int(os.environ.get("S3_MAX_UPLOAD_MB", 5))

    IS_PRODUCTION = os.environ.get("FLASK_ENV", "development") == "production"

    def __init__(self):
        if self.IS_PRODUCTION and self.JWT_SECRET == "replace-with-a-long-random-value":
            raise RuntimeError(
                "JWT_SECRET is still the placeholder value — set a real random "
                "secret before running in production."
            )
        if self.IS_PRODUCTION and not self.ALLOWED_ORIGINS:
            raise RuntimeError(
                "ALLOWED_ORIGINS must be set in production — refusing to run with "
                "an open CORS policy."
            )

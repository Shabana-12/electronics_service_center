from flask import Blueprint, request, jsonify
from ..security import login_required
from ..s3_utils import upload_ticket_image, UploadError
from .. import limiter

uploads_bp = Blueprint("uploads", __name__)

@uploads_bp.post("/call-image")
@login_required
@limiter.limit("30 per minute")   # photo uploads are heavier than normal API calls
def upload_call_image():
    kind = request.args.get("kind")
    if kind not in ("before", "after"):
        return jsonify({"error": "kind must be 'before' or 'after'"}), 400
    if "image" not in request.files or not request.files["image"].filename:
        return jsonify({"error": "No image file was attached"}), 400

    try:
        url = upload_ticket_image(request.files["image"], kind)
    except UploadError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"url": url})

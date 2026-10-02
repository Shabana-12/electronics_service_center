# Optional S3 Image Storage

Ticket images are optional. The application runs normally with `S3_BUCKET` left blank; only the image-upload endpoint is unavailable.

For EC2, attach an IAM role to the instance instead of storing AWS access keys in `.env`. The role only needs permission to put objects into the demo bucket/prefix used by this application.

The current UI stores and displays the returned HTTPS object URL, so the uploaded object must be readable by the browser. For a **portfolio/demo environment**, use a separate bucket containing only fictional images and scope public read access to the `calls/*` prefix. Do not use a bucket containing real customer images.

For a real production system with private customer media, keep the bucket private and replace permanent public URLs with an authenticated/presigned delivery design.

Example demo-only read policy (replace `YOUR_DEMO_BUCKET`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadDemoCallImages",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_DEMO_BUCKET/calls/*"
    }
  ]
}
```

The EC2 IAM role should separately grant `s3:PutObject` to `arn:aws:s3:::YOUR_DEMO_BUCKET/calls/*`.

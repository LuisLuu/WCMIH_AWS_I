terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Configure the AWS Provider (Make sure you configure AWS CLI locally later)
provider "aws" {
  region = "ap-southeast-1" # Using Singapore for lowest latency to Vietnam
}

# 1. Public S3 Bucket (Frontend Hosting)
resource "aws_s3_bucket" "public_frontend" {
  bucket = "wcm-public-frontend-${random_string.suffix.result}"
}

# 2. Private S3 Bucket (Knowledge Vault for PDFs)
resource "aws_s3_bucket" "private_vault" {
  bucket = "wcm-private-vault-${random_string.suffix.result}"
}

# 3. KMS Key (For encrypting secrets and tokens)
resource "aws_kms_key" "app_encryption_key" {
  description             = "KMS key for Project V token encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

# Helper to prevent bucket name collisions globally
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# 4. The IAM Role (The identity the server will wear)
resource "aws_iam_role" "ec2_app_role" {
  name = "wcm_ec2_app_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

# 5. The Strict IAM Policy (The actual permissions)
resource "aws_iam_policy" "strict_app_policy" {
  name        = "wcm_strict_app_policy"
  description = "Grants EC2 access to the private PDF bucket and KMS key"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Storage Permissions: ONLY for the private bucket
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        # The /* means access to the files inside the bucket, not just the bucket shell
        Resource = "${aws_s3_bucket.private_vault.arn}/*"
      },
      {
        # Encryption Permissions: ONLY for this specific key
        Effect = "Allow"
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.app_encryption_key.arn
      }
    ]
  })
}

# 6. Bind the Policy to the Role
resource "aws_iam_role_policy_attachment" "attach_app_policy" {
  role       = aws_iam_role.ec2_app_role.name
  policy_arn = aws_iam_policy.strict_app_policy.arn
}

# 7. Create the Instance Profile (Allows the EC2 to actually put the role on)
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "wcm_ec2_profile"
  role = aws_iam_role.ec2_app_role.name
}
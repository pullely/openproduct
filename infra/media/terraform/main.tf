terraform {
  required_version = ">= 1.15.0"

  backend "s3" {
    encrypt              = true
    use_lockfile         = true
    workspace_key_prefix = "env"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.52"
    }
  }
}

# --- Providers ---

provider "aws" {
  region = var.awsRegion

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Repository  = "${var.owner}/${var.repo}"
      Component   = var.component
      Environment = var.environment
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# --- Variables (standard Orun parameters) ---

variable "awsRegion" {
  type    = string
  default = "us-east-1"
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare API token with Workers R2 Storage permissions (from CLOUDFLARE_API_TOKEN env var)"
}

variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare account ID (from CLOUDFLARE_ACCOUNT_ID env var)"
}

variable "orgName" {
  type    = string
  default = "sourceplane"
}

variable "owner" {
  type    = string
  default = "sourceplane"
}

variable "repo" {
  type    = string
  default = "openproduct"
}

variable "namespace" {
  type    = string
  default = "sourceplane"
}

variable "namespacePrefix" {
  type    = string
  default = ""
}

variable "lane" {
  type    = string
  default = "verify"
}

variable "environment" {
  type    = string
  default = "stage"
}

variable "component" {
  type    = string
  default = "openproduct-media"
}

variable "stackName" {
  type    = string
  default = "openproduct-media"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

variable "r2_location_hint" {
  type        = string
  default     = "ENAM"
  description = "R2 bucket location hint (one of WNAM, ENAM, WEUR, EEUR, APAC, OC). Set once at create; immutable after."
}

# --- The media bucket (openproduct-worldclass MD1) ---
#
# ONE BUCKET PER ENVIRONMENT, OPENPRODUCT'S OWN. Holds the bytes behind
# `openproduct.product_media` — Postgres keeps only the index rows (1820), and
# every row's `storage_ref` is a content hash that names an object here:
#
#   media/{sha256}.{png|jpg|webp}        the original, as uploaded
#   media/{sha256}/w{400|800|1600}.webp  derivatives, generated at upload
#
# Content-addressed, so every object is immutable and the gateway serves it
# with a year-long immutable cache header; and so two makers uploading the
# same file share one object — which is why deleting a row never deletes an
# object (that is a retention question, openproduct-scale OS3).
#
# Bound to `openproduct-gateway` as `MEDIA` in its wrangler.jsonc, by name,
# in stage and prod only. The gateway's binding allowlist test names this
# bucket as the ONE data resource the worker may hold (MD-4, OPX-4).

locals {
  media_bucket_name = "openproduct-media-${var.environment}"
}

resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  name       = local.media_bucket_name
  location   = upper(var.r2_location_hint)
}

# --- Wiring manifest (BF5) ---
# The bucket name is the consumable value (R2 binds by name). Published at the
# conventional `<org>/<repo>/<component>/<env>` path, mirroring cloudflare-r2.

resource "aws_secretsmanager_secret" "wiring" {
  name        = "${var.orgName}/${var.repo}/${var.component}/${var.environment}"
  description = "Wiring outputs of the openproduct-media component (the gateway's MEDIA binding resolves the bucket name from here)"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret_version" "wiring" {
  secret_id = aws_secretsmanager_secret.wiring.id
  secret_string = jsonencode({
    openproduct_media_bucket_name = cloudflare_r2_bucket.media.name
  })
}

# --- Outputs (non-secret) ---

output "wiring_secret_arn" {
  description = "ARN of the wiring-manifest secret for this component/environment"
  value       = aws_secretsmanager_secret.wiring.arn
}

output "openproduct_media_bucket_name" {
  description = "Cloudflare R2 bucket name bound to openproduct-gateway as MEDIA"
  value       = cloudflare_r2_bucket.media.name
}

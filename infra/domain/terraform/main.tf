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
  description = "Cloudflare API token (from CLOUDFLARE_API_TOKEN env var)"
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
  default = "openproduct-domain"
}

variable "stackName" {
  type    = string
  default = "openproduct-domain"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

# --- Domain variables ---
#
# openproduct.live, now attached to openproduct's OWN web worker
# (openproduct-independence OX2). This component took the fenced OD7 block out
# of infra/terraform/cloudflare-domain: same zone posture (adopt by default —
# a product apex is often registered outside the account that holds the base
# domain), same empty-disables-it contract, different target service. The
# variable still arrives per-environment from intent.yaml's
# `parameterDefaults.terraform.OPENPRODUCT_CUSTOM_DOMAIN` (prod only), so
# every other environment plans to nothing.

variable "OPENPRODUCT_CUSTOM_DOMAIN" {
  type        = string
  default     = ""
  description = "The openproduct apex, e.g. openproduct.live. Empty disables it."
}

variable "openproductZoneMode" {
  type        = string
  default     = "existing"
  description = "Zone management mode for the openproduct apex: 'existing' adopts, 'managed' creates."
  validation {
    condition     = contains(["existing", "managed"], var.openproductZoneMode)
    error_message = "openproductZoneMode must be 'existing' or 'managed'."
  }
}

variable "workerNamePrefix" {
  type        = string
  default     = "openproduct-web"
  description = "Worker name prefix; full Worker service name is {prefix}-{environment}"
}

# --- Locals ---

locals {
  openproduct_domain     = var.OPENPRODUCT_CUSTOM_DOMAIN
  has_openproduct_domain = local.openproduct_domain != ""
  worker_name            = "${var.workerNamePrefix}-${var.environment}"
}

# --- Zone ---

data "cloudflare_zone" "openproduct_existing" {
  count = local.has_openproduct_domain && var.openproductZoneMode == "existing" ? 1 : 0
  name  = local.openproduct_domain
}

resource "cloudflare_zone" "openproduct_managed" {
  count      = local.has_openproduct_domain && var.openproductZoneMode == "managed" ? 1 : 0
  account_id = var.cloudflare_account_id
  zone       = local.openproduct_domain
  plan       = "free"
}

locals {
  openproduct_zone_id = local.has_openproduct_domain ? (
    var.openproductZoneMode == "existing"
    ? data.cloudflare_zone.openproduct_existing[0].id
    : cloudflare_zone.openproduct_managed[0].id
  ) : ""
}

# --- Worker custom domain attachment ---
#
# v4 `cloudflare_workers_domain` under the ~> 4.52 pin, matching
# cloudflare-domain; rename to `cloudflare_workers_custom_domain` with a state
# move when the repo upgrades the provider to v5.

resource "cloudflare_workers_domain" "openproduct" {
  count = local.has_openproduct_domain ? 1 : 0

  account_id  = var.cloudflare_account_id
  zone_id     = local.openproduct_zone_id
  hostname    = local.openproduct_domain
  service     = local.worker_name
  environment = "production"
}

# --- OPP3's `api.` hostname LIVES IN ITS OWN COMPONENT NOW ---
#
# `apps/openproduct/infra/api-domain` owns the `api.openproduct.live` record
# and Worker Route. They were here, and being here is what took openproduct.live
# down on 2026-09-09:
#
#   openproduct-web (prod build)  bakes       api.openproduct.live
#   api.openproduct.live          created by  THIS component
#   this component                dependsOn   openproduct-web
#
# The build ran before the component that creates the name, pointed at a
# hostname with no DNS record, and every public read failed. The failed smoke
# then blocked this component from applying, so the name stayed uncreated and
# the loop could not resolve itself.
#
# The apex genuinely needs `openproduct-web` to exist — a Custom Domain attaches
# to a Worker by name — so THAT dependency is real and stays. The `api.` Route
# only ever needed the GATEWAY. Splitting them removes the cycle by construction
# rather than by remembering: nothing about the API hostname waits on the site's
# deploy any more, on any estate, including one built from nothing.
#
# THIS COMMIT IS HALF THE MOVE. Terraform cannot move resources between root
# modules, so this one releases them (an apply here DESTROYS the record and the
# route) and the follow-up creates them in `api-domain`. The window between the
# two costs nothing today because no build references the hostname — the
# variable that did was rolled back — and it will never be cheaper than now.

# --- Outputs ---

output "openproduct_domain" {
  description = "The openproduct apex, or empty when not configured"
  value       = local.has_openproduct_domain ? local.openproduct_domain : ""
}

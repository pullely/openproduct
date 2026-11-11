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
  default = "openproduct-api-domain"
}

variable "stackName" {
  type    = string
  default = "openproduct-api-domain"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}

# --- The API hostname ---
#
# WHY THIS COMPONENT EXISTS AT ALL, WHICH IS THE ONLY INTERESTING THING ABOUT
# IT (openproduct-performance, option A).
#
# These two resources used to live in `openproduct-domain`, and living there is
# what took openproduct.live down for ~50 minutes on 2026-09-09:
#
#   openproduct-web (prod build)  bakes       api.openproduct.live
#   api.openproduct.live          created by  openproduct-domain
#   openproduct-domain            dependsOn   openproduct-web
#
# The build that needed the hostname ran BEFORE the component that creates it,
# by declared dependency order. Every public read failed, the front page
# rendered its error boundary, and the failed smoke then blocked
# `openproduct-domain` from applying — so the hostname stayed uncreated and the
# loop could not resolve itself.
#
# `openproduct-domain`'s dependency on the web worker is CORRECT and stays: a
# Workers Custom Domain attaches to a Worker by name, so the worker must exist.
# What was wrong is that the `api.` Route sat behind that dependency while only
# ever needing the GATEWAY. Splitting it out removes the cycle by construction
# rather than by remembering — nothing that creates this hostname now waits on
# the site's deploy, on any estate, including one built from nothing.
#
# `tests/web/src/deploy-ordering.test.ts` is the guard that holds it.

variable "OPENPRODUCT_CUSTOM_DOMAIN" {
  type        = string
  default     = ""
  description = "The openproduct apex, e.g. openproduct.live. Empty disables this component entirely."
}

variable "apiSubdomain" {
  type        = string
  default     = "api"
  description = "The label the gateway answers on, under the openproduct apex."
}

variable "gatewayNamePrefix" {
  type        = string
  default     = "openproduct-gateway"
  description = "Gateway Worker name prefix; full service name is {prefix}-{environment}"
}

locals {
  openproduct_domain     = var.OPENPRODUCT_CUSTOM_DOMAIN
  has_openproduct_domain = local.openproduct_domain != ""
  gateway_name           = "${var.gatewayNamePrefix}-${var.environment}"
  api_hostname           = local.has_openproduct_domain ? "${var.apiSubdomain}.${local.openproduct_domain}" : ""
}

# --- The zone, READ and never owned ---
#
# `openproduct-domain` owns the zone (it can even create one, when
# `openproductZoneMode = "managed"`). This component only ever LOOKS IT UP, and
# that asymmetry is deliberate: two states that could both create a zone is a
# worse problem than the one this split is fixing.
#
# The consequence, stated rather than discovered: on an estate where the zone
# does not exist yet, this data source fails and so does the apply. That is a
# TRANSIENT failure which the next run clears once the zone is there — not a
# deadlock, which is what the old shape produced. A dependency on
# `openproduct-domain` would fix the ordering and reintroduce the cycle
# (`openproduct-domain` waits on `openproduct-web`), so it is deliberately
# absent.

data "cloudflare_zone" "openproduct" {
  count = local.has_openproduct_domain ? 1 : 0
  name  = local.openproduct_domain
}

locals {
  openproduct_zone_id = local.has_openproduct_domain ? data.cloudflare_zone.openproduct[0].id : ""
}

# --- The record, and why it points at nothing ---
#
# A Worker Route only fires on a hostname the zone resolves AND PROXIES. The
# address behind it is never contacted — the worker answers before any origin
# fetch — so this is `100::`, the IPv6 discard-only prefix (RFC 6666), which is
# the documented Cloudflare shape for exactly this and is unroutable by design.
# A real address here would be a quiet fallback for any request the Route ever
# failed to catch.

resource "cloudflare_record" "openproduct_api" {
  count = local.has_openproduct_domain ? 1 : 0

  zone_id = local.openproduct_zone_id
  name    = var.apiSubdomain
  type    = "AAAA"
  value   = "100::"
  proxied = true
  comment = "Placeholder for the openproduct-gateway Worker Route; never contacted"
}

# --- The Route ---
#
# A ROUTE RATHER THAN A WORKERS CUSTOM DOMAIN. The original argument for this
# was wrong and is corrected in the epic: both shapes have a functional Cache
# API, zone Cache Rules never govern a worker's own response on either, and
# since OPP4a the gateway's cache is Workers Caching — keyed to the WORKER, not
# to a hostname, and working on `workers.dev` too.
#
# What the Route is actually worth is narrower and true: a canonical hostname
# for the public API, and `cf-cache-status` on it.

resource "cloudflare_worker_route" "openproduct_api" {
  count = local.has_openproduct_domain ? 1 : 0

  zone_id     = local.openproduct_zone_id
  pattern     = "${local.api_hostname}/*"
  script_name = local.gateway_name

  # The record must exist and be proxied before the route can match on it.
  depends_on = [cloudflare_record.openproduct_api]
}

# --- Outputs ---

output "openproduct_api_hostname" {
  description = "The gateway's hostname on the zone, or empty when not configured"
  value       = local.api_hostname
}

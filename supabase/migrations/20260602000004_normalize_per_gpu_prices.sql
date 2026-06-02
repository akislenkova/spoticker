-- Normalize Azure spot prices to per-GPU/hr (instead of per-VM/hr).
--
-- Problems fixed:
--   1. GPU count denominator was missing: AWS/Azure showed per-instance prices while
--      GCP shows per-accelerator prices.  For 8-GPU VMs (H200, H100) this produced an
--      8× discrepancy vs GCP.  Now the RPC picks the cheapest SKU by (retail_price /
--      gpu_count) and returns that normalized per-GPU price.
--   2. L4 false match: ILIKE '%L4%' matched Standard_L48as_v3 (Lsv3 storage VM).
--      Azure has no L4 GPU spot offering, so the L4 WHEN clause is removed entirely
--      — those cells will show as gray (no data), which is accurate.
--
-- GPU count table (fractional values for NV A10 vGPU partitions):
--   H200  ND96isr              → 8
--   H100  NC40/NCC40ads        → 1,  NC80adis → 2
--   A100  NC24ads → 1, NC48ads → 2, NC96ads → 4, ND96* → 8
--   T4    NC4/8/16as → 1, NC64as → 4
--   A10G  NV4/6ads → 1/6, NV8ads → 1/4, NV12ads → 1/3, NV18ads → 1/2,
--         NV36ads → 1, NV72ads → 2
--   CPU / unknown → 1 (no normalization needed)

CREATE OR REPLACE FUNCTION latest_azure_spot_prices_agg()
RETURNS TABLE(
  gpu_label    text,
  region       text,
  arm_sku_name text,
  retail_price float8
)
LANGUAGE sql
STABLE
AS $$
  WITH latest_ts AS (
    SELECT MAX(fetched_at) AS ts FROM azure_spot_prices
  ),
  labeled AS (
    SELECT
      p.arm_sku_name,
      p.region,
      p.retail_price,
      -- GPU count per SKU — fractional for NV A10 vGPU partitions
      CASE
        -- H200
        WHEN p.arm_sku_name ILIKE 'Standard_ND96isr_H200_v5'    THEN 8.0
        -- H100
        WHEN p.arm_sku_name ILIKE 'Standard_NC80adis_H100_v5'   THEN 2.0
        WHEN p.arm_sku_name ILIKE 'Standard_NC40ads_H100_v5'    THEN 1.0
        WHEN p.arm_sku_name ILIKE 'Standard_NCC40ads_H100_v5'   THEN 1.0
        WHEN p.arm_sku_name ILIKE 'Standard_ND%H100%'           THEN 8.0
        -- A100 80GB
        WHEN p.arm_sku_name ILIKE 'Standard_NC24ads_A100_v4'    THEN 1.0
        WHEN p.arm_sku_name ILIKE 'Standard_NC48ads_A100_v4'    THEN 2.0
        WHEN p.arm_sku_name ILIKE 'Standard_NC96ads_A100_v4'    THEN 4.0
        WHEN p.arm_sku_name ILIKE 'Standard_ND%A100%'           THEN 8.0
        -- T4
        WHEN p.arm_sku_name ILIKE 'Standard_NC4as_T4_v3'        THEN 1.0
        WHEN p.arm_sku_name ILIKE 'Standard_NC8as_T4_v3'        THEN 1.0
        WHEN p.arm_sku_name ILIKE 'Standard_NC16as_T4_v3'       THEN 1.0
        WHEN p.arm_sku_name ILIKE 'Standard_NC64as_T4_v3'       THEN 4.0
        -- A10G (NV vGPU partition sizes)
        WHEN p.arm_sku_name ILIKE 'Standard_NV4ads_A10_v5'      THEN 0.1667
        WHEN p.arm_sku_name ILIKE 'Standard_NV6ads_A10_v5'      THEN 0.1667
        WHEN p.arm_sku_name ILIKE 'Standard_NV8ads_A10_v5'      THEN 0.25
        WHEN p.arm_sku_name ILIKE 'Standard_NV12ads_A10_v5'     THEN 0.3333
        WHEN p.arm_sku_name ILIKE 'Standard_NV18ads_A10_v5'     THEN 0.5
        WHEN p.arm_sku_name ILIKE 'Standard_NV36ads_A10_v5'     THEN 1.0
        WHEN p.arm_sku_name ILIKE 'Standard_NV72ads_A10_v5'     THEN 2.0
        -- CPU types and unknown: 1 (per-instance = per-unit, no normalization)
        ELSE 1.0
      END AS gpu_count,
      -- Hardware type label (L4 clause removed — Azure has no L4 GPU spot VMs;
      -- the old %L4% pattern matched Lsv3 storage VMs like Standard_L48as_v3)
      CASE
        WHEN p.arm_sku_name ILIKE '%H200%'  THEN 'H200'
        WHEN p.arm_sku_name ILIKE '%H100%'  THEN 'H100'
        WHEN p.arm_sku_name ILIKE '%A100%'  THEN 'A100 80GB'
        WHEN p.arm_sku_name ILIKE '%V100%'  THEN 'V100'
        WHEN p.arm_sku_name ILIKE '%L40S%'  THEN 'L40S'
        -- L4 intentionally omitted (no Azure L4 GPU offering)
        WHEN p.arm_sku_name ILIKE '%A10%'   THEN 'A10G'
        WHEN p.arm_sku_name ILIKE '%T4%'    THEN 'T4'
        WHEN p.arm_sku_name ~* 'Standard_D[0-9]+a[sd]?s_v[45]'  THEN 'CPU (AMD)'
        WHEN p.arm_sku_name ~* 'Standard_D[0-9]+p[ls]?s_v[45]'  THEN 'CPU (ARM)'
        WHEN p.arm_sku_name ~* 'Standard_D[0-9]+d?s_v5'          THEN 'CPU (Intel)'
        ELSE NULL
      END AS gpu_label
    FROM azure_spot_prices p
    CROSS JOIN latest_ts
    WHERE p.fetched_at = latest_ts.ts
      AND p.arm_sku_name IS NOT NULL
  ),
  ranked AS (
    SELECT
      gpu_label,
      region,
      arm_sku_name,
      -- Normalize to per-GPU price; pick the cheapest per-GPU SKU per (type, region)
      retail_price / gpu_count AS retail_price,
      ROW_NUMBER() OVER (
        PARTITION BY gpu_label, region
        ORDER BY retail_price / gpu_count ASC
      ) AS rn
    FROM labeled
    WHERE gpu_label IS NOT NULL
  )
  SELECT gpu_label, region, arm_sku_name, retail_price
  FROM ranked
  WHERE rn = 1;
$$;

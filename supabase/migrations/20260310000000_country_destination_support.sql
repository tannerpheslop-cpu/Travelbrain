-- ============================================================
-- Migration: Country-level destination support
-- Date: 2026-03-10
--
-- 1. saved_items       – add location_country, location_country_code (nullable)
-- 2. trip_destinations – add location_country, location_country_code,
--                        location_type, proximity_radius_km
-- 3. Backfill          – extract country from location_name,
--                        map to ISO 3166-1 alpha-2 code, infer location_type
-- 4. RLS               – no policy changes needed (existing row-level policies
--                        automatically cover new columns)
-- ============================================================


-- ── 1. saved_items: new country columns (nullable — filled at save time) ──────

ALTER TABLE saved_items
  ADD COLUMN IF NOT EXISTS location_country      TEXT,
  ADD COLUMN IF NOT EXISTS location_country_code TEXT;


-- ── 2. trip_destinations: new columns (nullable first, NOT NULL after backfill)

ALTER TABLE trip_destinations
  ADD COLUMN IF NOT EXISTS location_country      TEXT,
  ADD COLUMN IF NOT EXISTS location_country_code TEXT,
  ADD COLUMN IF NOT EXISTS location_type         TEXT,
  ADD COLUMN IF NOT EXISTS proximity_radius_km   INTEGER NOT NULL DEFAULT 50;


-- ── 3. Backfill ───────────────────────────────────────────────────────────────

-- Step 3a: Extract country from location_name.
--   "Chengdu, China"                    → "China"
--   "New York, NY, United States"       → "United States"
--   "China"                             → "China"  (no comma — name IS the country)
--   Uses greedy '^.*,\s*' to consume everything up to the last comma.

UPDATE trip_destinations
SET location_country = TRIM(regexp_replace(location_name, '^.*,\s*', ''))
WHERE location_country IS NULL;


-- Step 3b: Map country name → ISO 3166-1 alpha-2 code.
--   Covers ~110 common travel destinations. Unknown countries fall back to 'XX'.

UPDATE trip_destinations
SET location_country_code = CASE location_country
  -- East Asia
  WHEN 'China'                      THEN 'CN'
  WHEN 'Japan'                      THEN 'JP'
  WHEN 'South Korea'                THEN 'KR'
  WHEN 'Korea'                      THEN 'KR'
  WHEN 'North Korea'                THEN 'KP'
  WHEN 'Taiwan'                     THEN 'TW'
  WHEN 'Hong Kong'                  THEN 'HK'
  WHEN 'Macau'                      THEN 'MO'
  WHEN 'Mongolia'                   THEN 'MN'
  -- Southeast Asia
  WHEN 'Thailand'                   THEN 'TH'
  WHEN 'Vietnam'                    THEN 'VN'
  WHEN 'Indonesia'                  THEN 'ID'
  WHEN 'Malaysia'                   THEN 'MY'
  WHEN 'Singapore'                  THEN 'SG'
  WHEN 'Philippines'                THEN 'PH'
  WHEN 'Myanmar'                    THEN 'MM'
  WHEN 'Cambodia'                   THEN 'KH'
  WHEN 'Laos'                       THEN 'LA'
  WHEN 'Brunei'                     THEN 'BN'
  WHEN 'Timor-Leste'                THEN 'TL'
  -- South Asia
  WHEN 'India'                      THEN 'IN'
  WHEN 'Nepal'                      THEN 'NP'
  WHEN 'Sri Lanka'                  THEN 'LK'
  WHEN 'Bangladesh'                 THEN 'BD'
  WHEN 'Pakistan'                   THEN 'PK'
  WHEN 'Bhutan'                     THEN 'BT'
  WHEN 'Maldives'                   THEN 'MV'
  WHEN 'Afghanistan'                THEN 'AF'
  -- Central Asia
  WHEN 'Kazakhstan'                 THEN 'KZ'
  WHEN 'Uzbekistan'                 THEN 'UZ'
  WHEN 'Kyrgyzstan'                 THEN 'KG'
  WHEN 'Tajikistan'                 THEN 'TJ'
  WHEN 'Turkmenistan'               THEN 'TM'
  -- Middle East
  WHEN 'UAE'                        THEN 'AE'
  WHEN 'United Arab Emirates'       THEN 'AE'
  WHEN 'Saudi Arabia'               THEN 'SA'
  WHEN 'Israel'                     THEN 'IL'
  WHEN 'Palestine'                  THEN 'PS'
  WHEN 'Jordan'                     THEN 'JO'
  WHEN 'Turkey'                     THEN 'TR'
  WHEN 'Türkiye'                    THEN 'TR'
  WHEN 'Iran'                       THEN 'IR'
  WHEN 'Iraq'                       THEN 'IQ'
  WHEN 'Qatar'                      THEN 'QA'
  WHEN 'Kuwait'                     THEN 'KW'
  WHEN 'Oman'                       THEN 'OM'
  WHEN 'Bahrain'                    THEN 'BH'
  WHEN 'Lebanon'                    THEN 'LB'
  WHEN 'Syria'                      THEN 'SY'
  WHEN 'Yemen'                      THEN 'YE'
  WHEN 'Georgia'                    THEN 'GE'
  WHEN 'Armenia'                    THEN 'AM'
  WHEN 'Azerbaijan'                 THEN 'AZ'
  -- Europe
  WHEN 'United Kingdom'             THEN 'GB'
  WHEN 'UK'                         THEN 'GB'
  WHEN 'England'                    THEN 'GB'
  WHEN 'Scotland'                   THEN 'GB'
  WHEN 'Wales'                      THEN 'GB'
  WHEN 'Northern Ireland'           THEN 'GB'
  WHEN 'France'                     THEN 'FR'
  WHEN 'Germany'                    THEN 'DE'
  WHEN 'Italy'                      THEN 'IT'
  WHEN 'Spain'                      THEN 'ES'
  WHEN 'Portugal'                   THEN 'PT'
  WHEN 'Netherlands'                THEN 'NL'
  WHEN 'Belgium'                    THEN 'BE'
  WHEN 'Switzerland'                THEN 'CH'
  WHEN 'Austria'                    THEN 'AT'
  WHEN 'Sweden'                     THEN 'SE'
  WHEN 'Norway'                     THEN 'NO'
  WHEN 'Denmark'                    THEN 'DK'
  WHEN 'Finland'                    THEN 'FI'
  WHEN 'Iceland'                    THEN 'IS'
  WHEN 'Poland'                     THEN 'PL'
  WHEN 'Czech Republic'             THEN 'CZ'
  WHEN 'Czechia'                    THEN 'CZ'
  WHEN 'Slovakia'                   THEN 'SK'
  WHEN 'Hungary'                    THEN 'HU'
  WHEN 'Romania'                    THEN 'RO'
  WHEN 'Bulgaria'                   THEN 'BG'
  WHEN 'Greece'                     THEN 'GR'
  WHEN 'Croatia'                    THEN 'HR'
  WHEN 'Slovenia'                   THEN 'SI'
  WHEN 'Serbia'                     THEN 'RS'
  WHEN 'Bosnia and Herzegovina'     THEN 'BA'
  WHEN 'North Macedonia'            THEN 'MK'
  WHEN 'Albania'                    THEN 'AL'
  WHEN 'Montenegro'                 THEN 'ME'
  WHEN 'Kosovo'                     THEN 'XK'
  WHEN 'Ukraine'                    THEN 'UA'
  WHEN 'Russia'                     THEN 'RU'
  WHEN 'Belarus'                    THEN 'BY'
  WHEN 'Moldova'                    THEN 'MD'
  WHEN 'Estonia'                    THEN 'EE'
  WHEN 'Latvia'                     THEN 'LV'
  WHEN 'Lithuania'                  THEN 'LT'
  WHEN 'Luxembourg'                 THEN 'LU'
  WHEN 'Ireland'                    THEN 'IE'
  WHEN 'Malta'                      THEN 'MT'
  WHEN 'Cyprus'                     THEN 'CY'
  WHEN 'Liechtenstein'              THEN 'LI'
  WHEN 'Monaco'                     THEN 'MC'
  WHEN 'Andorra'                    THEN 'AD'
  WHEN 'San Marino'                 THEN 'SM'
  WHEN 'Vatican City'               THEN 'VA'
  -- Americas
  WHEN 'United States'              THEN 'US'
  WHEN 'USA'                        THEN 'US'
  WHEN 'United States of America'   THEN 'US'
  WHEN 'Canada'                     THEN 'CA'
  WHEN 'Mexico'                     THEN 'MX'
  WHEN 'Brazil'                     THEN 'BR'
  WHEN 'Argentina'                  THEN 'AR'
  WHEN 'Colombia'                   THEN 'CO'
  WHEN 'Chile'                      THEN 'CL'
  WHEN 'Peru'                       THEN 'PE'
  WHEN 'Ecuador'                    THEN 'EC'
  WHEN 'Bolivia'                    THEN 'BO'
  WHEN 'Venezuela'                  THEN 'VE'
  WHEN 'Uruguay'                    THEN 'UY'
  WHEN 'Paraguay'                   THEN 'PY'
  WHEN 'Cuba'                       THEN 'CU'
  WHEN 'Jamaica'                    THEN 'JM'
  WHEN 'Dominican Republic'         THEN 'DO'
  WHEN 'Haiti'                      THEN 'HT'
  WHEN 'Costa Rica'                 THEN 'CR'
  WHEN 'Panama'                     THEN 'PA'
  WHEN 'Guatemala'                  THEN 'GT'
  WHEN 'Honduras'                   THEN 'HN'
  WHEN 'El Salvador'                THEN 'SV'
  WHEN 'Nicaragua'                  THEN 'NI'
  WHEN 'Belize'                     THEN 'BZ'
  WHEN 'Bahamas'                    THEN 'BS'
  WHEN 'Trinidad and Tobago'        THEN 'TT'
  WHEN 'Barbados'                   THEN 'BB'
  WHEN 'Puerto Rico'                THEN 'PR'
  -- Africa
  WHEN 'South Africa'               THEN 'ZA'
  WHEN 'Morocco'                    THEN 'MA'
  WHEN 'Egypt'                      THEN 'EG'
  WHEN 'Kenya'                      THEN 'KE'
  WHEN 'Tanzania'                   THEN 'TZ'
  WHEN 'Ethiopia'                   THEN 'ET'
  WHEN 'Ghana'                      THEN 'GH'
  WHEN 'Nigeria'                    THEN 'NG'
  WHEN 'Senegal'                    THEN 'SN'
  WHEN 'Madagascar'                 THEN 'MG'
  WHEN 'Mozambique'                 THEN 'MZ'
  WHEN 'Zimbabwe'                   THEN 'ZW'
  WHEN 'Zambia'                     THEN 'ZM'
  WHEN 'Uganda'                     THEN 'UG'
  WHEN 'Rwanda'                     THEN 'RW'
  WHEN 'Tunisia'                    THEN 'TN'
  WHEN 'Algeria'                    THEN 'DZ'
  WHEN 'Libya'                      THEN 'LY'
  WHEN 'Sudan'                      THEN 'SD'
  WHEN 'Cameroon'                   THEN 'CM'
  WHEN 'Ivory Coast'                THEN 'CI'
  WHEN 'Côte d''Ivoire'             THEN 'CI'
  WHEN 'Angola'                     THEN 'AO'
  WHEN 'Namibia'                    THEN 'NA'
  WHEN 'Botswana'                   THEN 'BW'
  -- Oceania
  WHEN 'Australia'                  THEN 'AU'
  WHEN 'New Zealand'                THEN 'NZ'
  WHEN 'Fiji'                       THEN 'FJ'
  WHEN 'Papua New Guinea'           THEN 'PG'
  WHEN 'Vanuatu'                    THEN 'VU'
  WHEN 'Samoa'                      THEN 'WS'
  WHEN 'Tonga'                      THEN 'TO'
  -- Fallback: 'XX' = unspecified/unknown
  ELSE 'XX'
END
WHERE location_country_code IS NULL;


-- Step 3c: Infer location_type.
--   "Chengdu, China"  → 'city'    (has a comma — city within a country)
--   "China"           → 'country' (no comma — the whole name is the country)

UPDATE trip_destinations
SET location_type = CASE
  WHEN location_name LIKE '%, %' THEN 'city'
  ELSE 'country'
END
WHERE location_type IS NULL;


-- Step 3d: Safety-net nulls before applying NOT NULL constraints.

UPDATE trip_destinations SET location_country      = 'Unknown' WHERE location_country IS NULL;
UPDATE trip_destinations SET location_country_code = 'XX'      WHERE location_country_code IS NULL;
UPDATE trip_destinations SET location_type         = 'city'    WHERE location_type IS NULL;


-- ── 4. Apply NOT NULL + CHECK constraint ──────────────────────────────────────

ALTER TABLE trip_destinations
  ALTER COLUMN location_country      SET NOT NULL,
  ALTER COLUMN location_country_code SET NOT NULL,
  ALTER COLUMN location_type         SET NOT NULL;

ALTER TABLE trip_destinations
  DROP CONSTRAINT IF EXISTS trip_destinations_location_type_check;

ALTER TABLE trip_destinations
  ADD CONSTRAINT trip_destinations_location_type_check
  CHECK (location_type IN ('city', 'country', 'region'));


-- ── 5. RLS: no changes needed ─────────────────────────────────────────────────
-- All existing policies operate at the row level and automatically protect
-- the new columns. No additional policies required.

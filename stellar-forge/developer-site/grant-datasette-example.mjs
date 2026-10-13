// MIT. Actual completed customer example received from the original Analysis products.
// Country and coverage values come from the published typed report; quantities remain exact decimal text.
export const DATASETTE_CUSTOMER_EXAMPLE = Object.freeze({
  "schema": "stellar-forge.datasette-grant-customer-example.v1",
  "id": "wri-geothermal-customer-20261012",
  "title": "Global Power Plant Database — geothermal customer analysis",
  "purpose": "Receive a complete reviewed source edition, produce useful country and source-quality analysis, and hand an edited workspace to another operator.",
  "operation": "SCF-DATASETTE-SOURCE-EDITIONS-07476-20261012",
  "completed_at": "2026-10-12T21:17:22.823913+00:00",
  "analysis_source_commit": "84b0b2415fe9f76a654f12dc23aae07eb1c5ebc4",
  "operation_url": "https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791840304679349",
  "source": {
    "publisher": "World Resources Institute",
    "collection": "Global Power Plant Database",
    "url": "https://datasette.io/global-power-plants/global-power-plants.json?primary_fuel=Geothermal&_shape=arrays&_size=50",
    "licence": "CC Attribution 4.0 License",
    "licence_url": "https://creativecommons.org/licenses/by/4.0/",
    "attribution_url": "https://github.com/simonw/global-power-plants-datasette/blob/main/metadata.json",
    "original_manifest_sha256": "fc63d12116d42e77f4a8364d5c3091a5aa29b4ad1348a338eae17e8881eaef56",
    "collection_window": {
      "not_before": "2026-10-12T14:31:08.835069+00:00",
      "not_after": "2026-10-12T14:41:57Z"
    },
    "native_edition_committed_at": "2026-10-12T15:10:34.759Z",
    "original_page_count": 4,
    "original_returned_positions": 26,
    "physical_columns": 25,
    "local_locator": "rowid",
    "reviewed_business_key": [
      "gppd_idnr"
    ],
    "source_columns": [
      "rowid",
      "country",
      "country_long",
      "name",
      "gppd_idnr",
      "capacity_mw",
      "latitude",
      "longitude",
      "primary_fuel",
      "other_fuel1",
      "other_fuel2",
      "other_fuel3",
      "commissioning_year",
      "owner",
      "source",
      "url",
      "geolocation_source",
      "wepp_id",
      "year_of_capacity_data",
      "generation_gwh_2013",
      "generation_gwh_2014",
      "generation_gwh_2015",
      "generation_gwh_2016",
      "generation_gwh_2017",
      "generation_data_source",
      "estimated_generation_gwh"
    ],
    "edition_sha256": "ee34942e0c4c090d4e5cab66eeb51dda49c5cf8852f86d9dfa299913b4115616",
    "capture_sha256": "a2649d3a20a6d74add638a5f346dc077e8e49099df4c7ca83f7914772c2026d0",
    "review_sha256": "1db191abe86485a4110cc1bb253e9c40be3fa82e90e204dd0a2e0a0ef1e6ca8b"
  },
  "summary": {
    "capacity_invalid_count": 0,
    "capacity_known_count": 189,
    "capacity_missing_count": 0,
    "capacity_year_missing_count": 110,
    "columns": 26,
    "coordinate_complete_count": 189,
    "countries": 22,
    "disclosed_capacity_mw": "12563.55",
    "owners": 60,
    "primary_fuels": 1,
    "recommended_key": "gppd_idnr",
    "rows": 189
  },
  "source_meaning": [
    "Disclosed plant capacity is retained as exact decimal MW text. Original numeric spellings and typed nulls remain in the source and report.",
    "The 26 returned source positions consist of 25 physical columns plus rowid. Analysis also retains a separate native-type annotation; that annotation is not an additional publisher field.",
    "The source was collected on 12 October 2026. Capacity-data years in this edition are 2016, 2017 or unstated; 110 records have no capacity-data year.",
    "Each generation column names one historical year. Its coverage is retained separately, so cross-year interpretation can use matching business identifiers.",
    "The reviewed gppd_idnr business key is present and unique across all 189 received records. Rowid remains the source locator."
  ],
  "report": {
    "publication_id": "70a1c9587cfb31a5193db63c26d8abfa",
    "revision": 1,
    "published_at": "2026-10-12T21:17:19.405234+00:00",
    "result_sha256": "8686d66c34ed08635ca25eb7f6ceddd4a5f539a8298fdcc1526464908b771c16",
    "sections": [
      {
        "ordinal": 0,
        "title": "Plant records",
        "rows": 189,
        "note": "Complete received source rows. Numeric lexemes remain text and source attribution is retained."
      },
      {
        "ordinal": 1,
        "title": "Disclosed capacity by country",
        "rows": 22,
        "note": "One source edition. Exact decimal MW totals include known, nonnegative capacity only; unknown totals remain blank. Null, absent and blank group labels are distinct. Capacity rank is computed with exact decimals; secondary fuels do not duplicate capacity."
      },
      {
        "ordinal": 2,
        "title": "Disclosed capacity by owner",
        "rows": 61,
        "note": "One source edition. Exact decimal MW totals include known, nonnegative capacity only; unknown totals remain blank. Null, absent and blank group labels are distinct. Capacity rank is computed with exact decimals; secondary fuels do not duplicate capacity."
      },
      {
        "ordinal": 3,
        "title": "Disclosed capacity by primary fuel",
        "rows": 1,
        "note": "One source edition. Exact decimal MW totals include known, nonnegative capacity only; unknown totals remain blank. Null, absent and blank group labels are distinct. Capacity rank is computed with exact decimals; secondary fuels do not duplicate capacity."
      },
      {
        "ordinal": 4,
        "title": "Source coverage",
        "rows": 141,
        "note": "Column types, nulls and blank values, with historical years and source attribution where present."
      }
    ]
  },
  "country_totals": [
    {
      "country": "USA",
      "country_long": "United States of America",
      "plant_count": 65,
      "disclosed_capacity_mw": "3765"
    },
    {
      "country": "PHL",
      "country_long": "Philippines",
      "plant_count": 9,
      "disclosed_capacity_mw": "1848.2"
    },
    {
      "country": "IDN",
      "country_long": "Indonesia",
      "plant_count": 10,
      "disclosed_capacity_mw": "1342"
    },
    {
      "country": "MEX",
      "country_long": "Mexico",
      "plant_count": 5,
      "disclosed_capacity_mw": "903.6"
    },
    {
      "country": "ITA",
      "country_long": "Italy",
      "plant_count": 33,
      "disclosed_capacity_mw": "857"
    },
    {
      "country": "KEN",
      "country_long": "Kenya",
      "plant_count": 6,
      "disclosed_capacity_mw": "754"
    },
    {
      "country": "NZL",
      "country_long": "New Zealand",
      "plant_count": 7,
      "disclosed_capacity_mw": "666"
    },
    {
      "country": "ISL",
      "country_long": "Iceland",
      "plant_count": 6,
      "disclosed_capacity_mw": "572"
    },
    {
      "country": "JPN",
      "country_long": "Japan",
      "plant_count": 14,
      "disclosed_capacity_mw": "536.3"
    },
    {
      "country": "TUR",
      "country_long": "Turkey",
      "plant_count": 11,
      "disclosed_capacity_mw": "480"
    },
    {
      "country": "SLV",
      "country_long": "El Salvador",
      "plant_count": 2,
      "disclosed_capacity_mw": "204"
    },
    {
      "country": "CRI",
      "country_long": "Costa Rica",
      "plant_count": 5,
      "disclosed_capacity_mw": "198.95"
    },
    {
      "country": "NIC",
      "country_long": "Nicaragua",
      "plant_count": 2,
      "disclosed_capacity_mw": "159"
    },
    {
      "country": "RUS",
      "country_long": "Russia",
      "plant_count": 3,
      "disclosed_capacity_mw": "74"
    },
    {
      "country": "GTM",
      "country_long": "Guatemala",
      "plant_count": 2,
      "disclosed_capacity_mw": "53.8"
    },
    {
      "country": "HND",
      "country_long": "Honduras",
      "plant_count": 1,
      "disclosed_capacity_mw": "39"
    },
    {
      "country": "PNG",
      "country_long": "Papua New Guinea",
      "plant_count": 1,
      "disclosed_capacity_mw": "30"
    },
    {
      "country": "PRT",
      "country_long": "Portugal",
      "plant_count": 2,
      "disclosed_capacity_mw": "28.8"
    },
    {
      "country": "CHN",
      "country_long": "China",
      "plant_count": 2,
      "disclosed_capacity_mw": "26.1"
    },
    {
      "country": "DNK",
      "country_long": "Denmark",
      "plant_count": 1,
      "disclosed_capacity_mw": "14"
    },
    {
      "country": "ETH",
      "country_long": "Ethiopia",
      "plant_count": 1,
      "disclosed_capacity_mw": "7.3"
    },
    {
      "country": "FRA",
      "country_long": "France",
      "plant_count": 1,
      "disclosed_capacity_mw": "4.5"
    }
  ],
  "capacity_data_years": [
    {
      "year": null,
      "state": "null",
      "records": 110
    },
    {
      "year": "2017",
      "state": "present",
      "records": 74
    },
    {
      "year": "2016",
      "state": "present",
      "records": 5
    }
  ],
  "generation_coverage": [
    {
      "year": "2013",
      "field": "generation_gwh_2013",
      "known_records": 60,
      "null_records": 129,
      "disclosed_generation_gwh": "15190.414080000000164",
      "note": "One historical year only; quantities are never added across generation years."
    },
    {
      "year": "2014",
      "field": "generation_gwh_2014",
      "known_records": 61,
      "null_records": 128,
      "disclosed_generation_gwh": "15589.523",
      "note": "One historical year only; quantities are never added across generation years."
    },
    {
      "year": "2015",
      "field": "generation_gwh_2015",
      "known_records": 64,
      "null_records": 125,
      "disclosed_generation_gwh": "16585.660000000000467",
      "note": "One historical year only; quantities are never added across generation years."
    },
    {
      "year": "2016",
      "field": "generation_gwh_2016",
      "known_records": 66,
      "null_records": 123,
      "disclosed_generation_gwh": "16937.08300000000159",
      "note": "One historical year only; quantities are never added across generation years."
    },
    {
      "year": "2017",
      "field": "generation_gwh_2017",
      "known_records": 65,
      "null_records": 124,
      "disclosed_generation_gwh": "16680.041000000001005",
      "note": "One historical year only; quantities are never added across generation years."
    }
  ],
  "receiving": {
    "original_rows": 189,
    "original_rows_sha256": "df23a90db14aa437ebd29d86b153fbb2e3cb6bdaabd53740a729b821f9091331",
    "workspace_id": "aaae8fc5f4924ae8849c2bff43b95b0d",
    "edition_id": "377ec1c2ddd3f082f6d87786a96755436d959d76b83f3f58cd033a4bc624052d",
    "source_report_workbook_products": 5,
    "first_archive": {
      "bytes": 656414,
      "sha256": "696b1f940f23416a5e2b8f070e007a77b41a3d40ad223431b594e8f53c888bda",
      "received_files": 31
    },
    "customer_country": "USA",
    "customer_rows": 65,
    "saved_query": {
      "max_rows": 100000,
      "name": "datasette_customer_a7862e9226b8",
      "parameters_text": "[\"USA\"]",
      "revision": 1,
      "sql": "SELECT \"country\",\"name\",\"gppd_idnr\",\"capacity_mw\",\"year_of_capacity_data\" FROM \"datasette_377ec1c2ddd3_plants\" WHERE \"country\" = ? ORDER BY \"name\"",
      "parameters": [
        "USA"
      ]
    },
    "result_sha256": "6a9141a22c494bd86039b9e724d5d81978d8fbe76b0b1f80fa44f7ae1153b418",
    "reopened_result_sha256": "6a9141a22c494bd86039b9e724d5d81978d8fbe76b0b1f80fa44f7ae1153b418",
    "edited_archive": {
      "bytes": 660741,
      "sha256": "508c80f9e9beaa8c07abd8925b5a79a60219cc7837546e7a9f9f20288ddadd33",
      "received_files": 31
    }
  },
  "products": [
    {
      "id": "workbook",
      "name": "Datasette_Analysis.xlsx",
      "label": "Analysis workbook",
      "description": "Original Excel workbook with plant, country, owner, fuel and source-coverage tables.",
      "bytes": 59405,
      "sha256": "9a892dee51e1dabff3f0d9f0dd1e63a19d9938f6fd3d4919c7a6453b5e51a342",
      "url": "https://chatgpt.com/api/library/files/libfile_bdfd843bcd6481919be911e00be870c5/download"
    },
    {
      "id": "workbook-handover",
      "name": "Datasette_Workbook_Handover.zip",
      "label": "Workbook handover",
      "description": "Original workbook and its complete handover members.",
      "bytes": 90762,
      "sha256": "bd07d7060069f9736b553f1ec434bc2992990c63a5dd28127aa4696fa1961ac6",
      "url": "https://chatgpt.com/api/library/files/libfile_18792f4b2b908191958007a4c4233efd/download"
    },
    {
      "id": "report-html",
      "name": "Datasette_Report.html",
      "label": "Complete analysis report",
      "description": "Published report with all 189 plant records and the complete source summaries.",
      "bytes": 650741,
      "sha256": "4521e3cc985fa6db0c28c2a1b334611e2b5cd887fdbe2dd6d9553b7271e1b10e",
      "url": "https://chatgpt.com/api/library/files/libfile_833c06cd58408191a41cb08e3699fe8b/download"
    },
    {
      "id": "report-json",
      "name": "Datasette_Report.json",
      "label": "Report data",
      "description": "Original report definition, retained view identities and five complete typed tables.",
      "bytes": 511332,
      "sha256": "55abd9881f041f03640dde874f759e25419de8817a55effab5028cf77bfd0750",
      "url": "https://chatgpt.com/api/library/files/libfile_680fc6853a388191b44c348df9062cdf/download"
    },
    {
      "id": "report-tables",
      "name": "Datasette_Report_Tables.zip",
      "label": "Report tables",
      "description": "Original exported table files for the published report.",
      "bytes": 83538,
      "sha256": "d1cbcfc297148623409eaa0305194d3670873afd770d1be1e4d0787999aafc69",
      "url": "https://chatgpt.com/api/library/files/libfile_f6d08d5056808191b9b2ad12d2b07391/download"
    },
    {
      "id": "edited-workspace",
      "name": "Datasette_Customer_Workspace.zip",
      "label": "Edited customer workspace",
      "description": "Complete original editable workspace after the receiving operator saved the USA country query; reopened through the original archive receiver.",
      "bytes": 660741,
      "sha256": "508c80f9e9beaa8c07abd8925b5a79a60219cc7837546e7a9f9f20288ddadd33",
      "url": "https://chatgpt.com/api/library/files/libfile_f255113651b88191b2424a733d00b216/download"
    }
  ]
});

use writeback_engine::{DocumentPayload, FieldMapper};

#[test]
fn maps_payload_fields_by_doc_code() {
    let payload: DocumentPayload =
        serde_json::from_str(include_str!("fixtures/sample_payload.json")).unwrap();
    let mapper = FieldMapper::from_config(
        r#"{
          "DOC001": {
            "chiefComplaint": "chiefComplaint",
            "presentIllness": "presentIllness",
            "diagnoses": "diagnoses",
            "treatmentPlan": "treatmentPlan"
          }
        }"#,
    )
    .unwrap();

    let fields = mapper.map(&payload);

    assert_eq!(fields.len(), 4);
    assert!(fields
        .iter()
        .any(|(key, value)| key == "chiefComplaint" && value == "反复胸闷3天，加重1天。"));
}

#[test]
fn uses_identity_mapping_when_doc_config_is_missing() {
    let payload: DocumentPayload =
        serde_json::from_str(include_str!("fixtures/sample_payload.json")).unwrap();
    let mapper = FieldMapper::identity();

    let fields = mapper.map(&payload);

    assert!(fields.iter().any(|(key, _)| key == "presentIllness"));
}

#[test]
fn honors_payload_field_order_before_remaining_fields() {
    let payload: DocumentPayload = serde_json::from_str(
        r#"{
          "docCode": "DOC001",
          "docName": "入院记录",
          "patientId": "10082",
          "fields": {
            "diagnoses": "诊断",
            "chiefComplaint": "主诉",
            "presentIllness": "现病史",
            "extraField": "额外字段"
          },
          "fieldOrder": ["chiefComplaint", "presentIllness", "diagnoses"],
          "content": "正文"
        }"#,
    )
    .unwrap();
    let mapper = FieldMapper::identity();

    let fields = mapper.map(&payload);
    let keys = fields
        .iter()
        .map(|(key, _)| key.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        keys,
        vec![
            "chiefComplaint",
            "presentIllness",
            "diagnoses",
            "extraField"
        ]
    );
}

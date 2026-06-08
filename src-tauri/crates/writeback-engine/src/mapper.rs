use crate::types::{DocumentPayload, WritebackError};
use std::collections::HashMap;

#[derive(Debug, Clone, Default)]
pub struct FieldMapper {
    mappings: HashMap<String, HashMap<String, String>>,
}

impl FieldMapper {
    pub fn identity() -> Self {
        Self::default()
    }

    pub fn from_config(config: &str) -> Result<Self, WritebackError> {
        let mappings = serde_json::from_str::<HashMap<String, HashMap<String, String>>>(config)?;
        Ok(Self { mappings })
    }

    pub fn map(&self, source: &DocumentPayload) -> Vec<(String, String)> {
        let doc_mapping = self.mappings.get(&source.doc_code);
        let mut ordered_keys = Vec::new();

        if let Some(field_order) = &source.field_order {
            for key in field_order {
                if source.fields.contains_key(key) && !ordered_keys.contains(key) {
                    ordered_keys.push(key.clone());
                }
            }
        }

        for key in source.fields.keys() {
            if !ordered_keys.contains(key) {
                ordered_keys.push(key.clone());
            }
        }

        ordered_keys
            .into_iter()
            .filter_map(|source_key| {
                let target_key = doc_mapping
                    .and_then(|mapping| mapping.get(&source_key))
                    .cloned()
                    .unwrap_or_else(|| source_key.clone());
                if target_key.is_empty() {
                    None
                } else {
                    let value = source.fields.get(&source_key)?.clone();
                    Some((target_key, value))
                }
            })
            .collect()
    }
}

use writeback_engine::{ClipboardDriver, DriverConfig, TargetInfo, WritebackDriver};

#[tokio::test]
async fn clipboard_driver_reports_empty_batch_without_touching_clipboard() {
    let mut driver = ClipboardDriver::default();
    driver.init(&DriverConfig::default()).await.unwrap();
    driver.locate_target(&TargetInfo::Clipboard).await.unwrap();

    let stats = driver.write_fields(&[]).await.unwrap();

    assert_eq!(stats.total, 0);
    assert_eq!(stats.success, 0);
    assert_eq!(stats.failed, 0);
}

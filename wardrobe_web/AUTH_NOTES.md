# 网页桥接为什么显示未连接

当前网页桥接已经能启动，但它要作为 **新的 MQTT 客户端** 登录阿里云物联网平台。

阿里云官方文档说明：

- `mqttClientId` 可以自定义
- 但 `mqttPassword` 需要用 `DeviceSecret` 按 `clientId + deviceName + productKey` 重新签名
- 如果 `clientId` 改了，`password` 也必须重算

参考文档：

- [Alibaba Cloud IoT Platform: Establish MQTT connections](https://www.alibabacloud.com/help/en/iot/user-guide/establish-mqtt-connections-over-tcp)

## 现在这个网页桥接要怎么改通

打开 [bridge_config.json](./bridge_config.json)，把下面这个字段补上：

```json
"device_secret": "这里填阿里云设备密钥"
```

补上之后，`app.py` 会自动用以下参数重算网页登录签名：

- `product_key`
- `device_name`
- `raw_client_id`
- `device_secret`
- `sign_method`

然后重启网页桥接服务即可。

## 注意

- 不要把网页桥接的 `raw_client_id` 改成和 STM32 完全一样，否则可能把单片机挤下线。
- `device_secret` 不是当前代码里那个 `password`，而是阿里云控制台设备详情里的 **DeviceSecret**。

# Render 长期部署说明

## 1. 准备代码仓库

- 把 `C:\Users\23352\Documents\New project 2\wardrobe_web` 上传到一个 GitHub 仓库
- 建议把当前目录作为仓库根目录，或者确保 `wardrobe_web` 作为子目录存在
- 不要把真实的 `bridge_config.json` 上传到公开仓库，仓库里使用 `bridge_config.example.json` 作为示例

## 2. 在 Render 创建 Web Service

1. 打开 [Render Dashboard](https://dashboard.render.com/)
2. 选择 `New +`
3. 选择 `Web Service`
4. 连接你的 GitHub 仓库
5. 如果仓库根目录不是 `wardrobe_web`，把 `Root Directory` 填成 `wardrobe_web`

## 3. 构建与启动配置

如果 Render 自动读取 `render.yaml`，这些配置会自动带出。

- `Build Command`
  `pip install -r requirements.txt`
- `Start Command`
  `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 8`

## 4. 必填环境变量

在 Render 的 `Environment` 中添加下面这些变量：

- `PRODUCT_ID`
- `DEVICE_NAME`
- `DEVICE_ID`
- `API_BASE`
- `CURRENT_DATAPOINTS_BASE`
- `API_ACCESS_KEY`
- `DEVICE_ACCESS_KEY`
- `API_RESOURCE`
- `DATASTREAM_IDS`

推荐值格式：

- `API_BASE`
  `http://api.heclouds.com`
- `CURRENT_DATAPOINTS_BASE`
  `https://iot-api.heclouds.com`
- `API_RESOURCE`
  `products/PU3721W9C4`
- `DATASTREAM_IDS`
  `temp,humi,tvoc,pm25,mode,h_y,p_y,r1,r2,sg`

可选环境变量：

- `CURRENT_DATAPOINTS_ACCESS_KEY`
- `CURRENT_DATAPOINTS_RESOURCE`
- `CURRENT_DATAPOINTS_TOKEN_VERSION`
- `CURRENT_DATAPOINTS_METHOD`
- `CURRENT_DATAPOINTS_TTL_SECONDS`
- `CURRENT_DATAPOINTS_AUTHORIZATION`
- `TOKEN_TTL_SECONDS`
- `BRIDGE_MODE`
- `BRIDGE_CONFIG_PATH`

## 5. 推荐配置方式

最稳的方式是只使用环境变量，不依赖部署环境中的 `bridge_config.json`。

建议至少增加：

- `CURRENT_DATAPOINTS_ACCESS_KEY`
  填设备或产品可用的 access key
- `CURRENT_DATAPOINTS_RESOURCE`
  推荐填 `products/<PRODUCT_ID>/devices/<DEVICE_NAME>`

这样部署后就不会再依赖已经过期的静态 token。

## 6. 部署完成后的访问地址

Render 部署成功后，会给你一个长期地址，格式类似：

- `https://smart-wardrobe-control.onrender.com`

## 7. 注意事项

- Render 免费实例可能会休眠，首次打开会慢几秒
- 这是长期地址，但仍依赖你的 Render 服务持续存在
- 不要把 OneNET 密钥直接公开到网页前端，当前项目已经通过 Flask 后端桥接避免了这个问题

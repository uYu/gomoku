# 桌边与五子棋部署准备

部署入口使用 `http://162.14.123.217:8210/boardgame/`，无需域名。
用户要求保持 Homepage 原样：不得修改其容器、配置或 80 端口。
桌游原端口继续保留；独立网关只占用 8210。

## 访问结构

| 路径 | 服务 | 现有/计划内部端口 |
| --- | --- | --- |
| 原 IP 的 `/`（80 端口） | 原有 Homepage，保持原样 | 80 |
| `/boardgame/` | 桌边 · 桌游大厅 | 8209 |
| `/boardgame/gomoku/` | 五子之间 | 8209 |
| `/boardgame/othello/` | 黑白棋 | 8207 |
| `/boardgame/scout/` | 星光马戏团 | 8203 |
| `/boardgame/heaven-ale/` | 天堂与美酒 | 8200 |
| `/boardgame/modern-art/` | 现代艺术 | 8201 |
| `/boardgame/jaipur/` | 粉城商事 | 8204 |
| `/boardgame/patchwork/` | 拼布艺术 | 8205 |
| `/boardgame/carnegie/` | 卡内基工具 | 8206 |
| `/boardgame/ra/` | 太阳神 Ra | 8208 |

路径采用小写、以 `/` 结尾。网关将无末尾斜线的游戏入口重定向到规范地址，
再剥离对应前缀转发给现有容器。原端口入口可在迁移验收期间保留。
五子棋本身也接受完整 `/boardgame/gomoku/` 前缀，因此可以直接在本地测试。

SCOUT 和黑白棋本地源码的静态资源使用相对 base；现有黑白棋客户端还有
根路径 `/api/native/*`，网关已准备兼容路由。其他桌游的后端 API、WebSocket、
重定向和存档行为必须在正式切换时逐个验收，不能只检查首页 HTML。
没有修改其他桌游源码，也没有在各服务之间共享游戏存档。

## 五子棋容器

原静态 Nginx 镜像无法运行自训入门模型，现改为同容器 Node HTTP 服务与
原生 C++ Rapfi，官方中高档及提示仍在浏览器 Wasm 中运行。
Docker 构建默认 `VITE_BEGINNER_API=1`：普通入口即可使用自训入门，保留
600ms 最短落子等待、成五/堵四规则与禁手检查。
自训权重只读挂载，不放进 Git、静态目录或源码下载包。原始棋谱与训练检查点
不参与部署。官方模型、许可及对应引擎源码仍随静态资源提供。

在已有本地实验权重的机器上准备私有文件：

```sh
python3 scripts/prepare-deployment-models.py
# 输出 .build/runtime-models/，包含 3 个已有权重、2 个配置及 SHA-256 清单
# 单独安全复制该目录到部署机器相同位置，不上传整个 .build/
docker compose up -d --build
```

Compose 默认仅绑定 `127.0.0.1:8209`，由统一网关公开访问。私有模型缺失时
容器健康检查返回失败；部署验收还应实际请求两个规则的 AI 接口，确认零搜索。
Docker 使用 Node 22、多阶段构建、非 root 运行、init 和自动重启。
首次构建需要能访问 Docker Hub、Debian 与 npm 镜像源；不要为一个应用
改动其他服务依赖的全局代理或重启整个 Docker daemon。

## 本地验证

```sh
npm test
npm run build
npm run test:server
npm run assets:verify
```

`test:server` 使用临时本地端口验证根目录/子路径、斜线重定向、资源 MIME、
私有文件隔离、请求校验，以及两套实际自训模型的零搜索/堵四/避禁手。
无本地实验权重时跳过实际模型项，其余服务检查仍运行。
大厅源文件位于 `public/boardgame/`，普通 Vite 开发地址 `/boardgame/` 可预览大厅；
完整游戏子路径需要生产 HTTP 服务（`npm start`）或前置反向代理。

在本机验证生产入门服务时，可按本机绝对路径生成独立配置：

```sh
python3 scripts/prepare-deployment-models.py --output .build/preview-models \
  --runtime-dir "$PWD/.build/preview-models" --app-dir "$PWD"
VITE_BEGINNER_API=1 npm run build
GOMOKU_MODELS_DIR="$PWD/.build/preview-models" HOST=127.0.0.1 PORT=5185 npm start
# http://127.0.0.1:5185/boardgame/
```

## 上线与兼容

目录为 `/root/app/gomoku`。先构建并验收五子棋容器，再用
`docker compose -p boardgame-gateway -f deploy/gateway-compose.yaml up -d`
启动独立网关。Caddy 配置只监听 8210，默认根路径跳转 `/boardgame/`；
没有 Homepage 上游，也不修改 `/root/web/homepage` 的任何文件。

现代艺术、天堂与美酒的已有构建使用根路径资源和 `/api/replays`。
`server/legacy-proxy.ts` 仅对新子路径的 HTML/JS/CSS 响应改写 URL，并将
对应 API 转发到原容器；原端口的页面字节与行为保持不变。
黑白棋的 `/api/native/*` 通过独立网关兼容转发到原 8207。

网络无法拉取 Node 镜像时可使用 `deploy/Dockerfile.prebuilt`：使用服务器已缓存的
Emscripten 构建环境编译原生引擎，再仅复制 Node、所需动态库与应用资源到
scratch 运行镜像；不会把整个构建环境放入运行镜像。
构建前需要准备 `VITE_BEGINNER_API=1` 的 dist，并将其包含在构建上下文中。
不要改动全局代理，也不要为此重启 Docker。

上线验收包括两个规则的零搜索模型 API、私有文件不可下载、各游戏静态资源、
两个棋谱 API、Othello 原生 API、所有旧端口，以及 Homepage 容器 ID/配置哈希一致。

## 已完成的验收（2026-10-29）

独立大厅与五子棋容器已上线。全部 9 个新路径及原端口返回正常页面，
资源/Worker、两套零搜索模型、成五防守/禁手过滤、现代艺术画作及两套棋谱
API 已检查。Homepage 的容器 ID、启动时间及配置哈希均保持一致。
Othello 的原生 API 在旧端口本来返回 404，新路径保留相同响应；现有浏览器
AI 不受影响。五子棋没有“返回大厅”按钮，主菜单保留在游戏内。

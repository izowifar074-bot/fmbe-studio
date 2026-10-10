# FMBE Studio 本地 API 0.1

基础地址 `http://127.0.0.1:18120`。JSON UTF-8；仅监听本机。接口不访问模型服务。

## 状态与能力

`GET /api/context` 返回 project、compilation、不可变 frame、撤销数量及全局持物标定来源。

`GET /api/capabilities` 返回已实现能力与明确缺口。不要把 animations 数量当成兼容性测试数量。

`GET /api/project` 返回作者工程；`GET /api/project/download` 下载 JSON。

## 原子修改

`POST /api/design/apply`

```json
{
  "base_revision": 1,
  "request_id": "edit-001",
  "patch": {
    "params": {"reach": 3.1},
    "overrides": {"wrist": {"size": [0.6, 0.6, 0.6]}},
    "budget": 32
  }
}
```

patch 允许 source、params、overrides、budget、name。位置覆盖为世界坐标；尺寸为完整长度。`overrides: {"wrist": null}` 删除该覆盖。

必须先读修订。成功返回完整新 context；422 表示编译未通过且不提交。超预算工程可保留编辑，但不可实验导出。409 表示版本冲突或重复 request_id 对应了不同内容。相同 request_id+内容重试返回同一结果，不重复修改。

`POST /api/project/undo`、`/redo`：`{"base_revision":2}`。

`POST /api/project/new`：`{"base_revision":2,"example":"bridge"}`。示例 ID：arm、bridge、profile、frame。

`POST /api/project/import`：`{"base_revision":2,"project":{...完整工程...}}`。

## 命令实验

`POST /api/experiment/commands`

```json
{
  "reset": true,
  "commands": "summon fox 0 0 0\nplayanimation @e animation.warden.move none 0 \"v.body_x_rot=math.sin(q.life_time*90)*20;\" demo"
}
```

返回每条命令的 ok、affected/error，以及 frame。reset 只清空当前运行实例，不删除作者工程。命令错误保留诊断，不代表整批事务回滚。实验改变不会自动改写作者源码。`POST /api/simulation/reset` 从当前工程编译命令重新初始化。

## 时间与快照

`POST /api/simulation/step`：`{"dt":0.016666666666666666,"frames":60}`。

`GET /api/simulation/frame`：读取，不推进时间或执行表达式。

`POST /api/simulation/checkpoint`：空对象，返回检查点 id。

`POST /api/simulation/restore`：`{"id":"检查点id"}`，恢复变量、控制器、时间、事件记录与当前帧。最多保留 20 个内存检查点；服务器重启后不保留。

`GET /api/inspect?id=lower`：按语义部件 ID 查看来源与实际命令。原生命令实体使用 e1 等运行 ID，可查看变量和骨骼。

`POST /api/entity/state`：`{"id":"e1","state":{"is_baby":1}}`。这是注入测试状态，不是游戏 AI/物理模拟。

## 摄像机与截图

`POST /api/camera`

```json
{"mode":"first_person","position":[0,2,-7],"rotation":[0,0],"fov":70}
```

rotation=[pitch,yaw]，单位度；yaw0朝+Z，正pitch向下。模式 first_person、third_person、third_person_front、free。position 在第一人称为眼点，在第三人称为偏移前的参考眼点。固定第三人称偏移 4 格，frame.camera 保存解析后的实际摄像机，Molang 同样读取它。

`POST /api/render/capture`：`{"view":"front","width":1024,"height":768}`。view 为 player/editor/front/side/top。返回任务 id 和 status_url。需要至少一个打开的工作台窗口；否则返回503。

`GET /api/render/result?id=...`：pending/completed/failed，完成后给出 image_url。`GET image_url` 返回 PNG。请求固定帧副本，不推进动画；任务保存修订、帧编号和时间。

WebSocket `/api/events` 推送 revision 通知。截图渲染由工作台窗口协作完成，不能标成完全无浏览器的后端截图。

## 成本候选

`POST /api/experiment/optimize`：`{"base_revision":1,"tolerance":0.05}`。tolerance 0～0.25格。返回 runId 和 candidates；始终保留 original。

这是有界尺寸量化候选，不是架构中全部轮廓/动作约束求解器。返回真实编译实体数与尺寸损失；接受前检查影响。

`POST /api/candidate/accept`：`{"base_revision":1,"runId":"...","candidateId":"grid-0.05"}`。

## 导出

`POST /api/export`：`{"experimental":true}` 返回 UTF-8 文件字典。

`GET /api/export.zip?experimental=true` 返回 ZIP。未显式选择实验导出、超预算或编译错误会拒绝。

导出包括源工程、持物补偿证据边界、资源版本、初始化与持续/清理函数。网易实际导入和画面尚待验证。

## 资源查询

`GET /api/resources/animations?q=warden` 返回匹配动画及涉及骨骼。

`GET /api/resources/animation?id=animation.warden.move` 返回官方定义与来源。

`GET /api/resources/geometry` 返回狐狸/玩家几何。

## 调用建议

先读 context 和 capabilities；尽量只改一个参数或模块；以 request_id 去重；遇到409重新读状态；遇到422修复报告对应的源码；从 frame/inspect 获取数值证据；候选需要明确选择。模型无需展开所有骨骼矩阵才能做普通造型。

## 面向模型的五个工具

`GET /api/tools` 返回 function-calling 格式的五个工具定义。`POST /api/tools/call` 接受 `{"name":"context_read","arguments":{"include_source":true}}`。

工具名称为 context_read、design_apply、experiment_run、candidate_accept、project_export。design_apply 等参数与对应 HTTP 接口一致。experiment_run 用 mode 选择 optimize、commands、step、observe、capture，固定流程由服务内部执行。

context_read 默认只返回部件、参数、成本、修订及重要诊断，不转储全部骨骼。design_apply 成功后也返回这一精简结果。`GET /api/context/compact?source=true` 可直接读取。

`GET /api/observe/geometry?width=1024&height=768` 返回持物实际仿真矩阵产生的角点、世界包围盒、屏幕投影和近裁剪面关系。它是几何投影，不是已验证的 Bedrock 实体可见性判断。没有适配的物品列在 unsupportedItems 中，不返回伪造立方体数据。

`GET /api/experiment/recording` 返回原始命令时间记录和完整快照，可单独保存失败实验，不把作者工程的命令误当作当前实验。

SDK 尺寸域当前为 0.0001～128 格。原生命令实验不会将这一高层范围冒充游戏限制。

## 0.2 枪械与 DeepSeek

- `GET /api/model/status`：只返回配置状态、固定官方URL与模型名，没有密钥。
- `POST /api/model/config`：`{"apiKey":"用户自行输入的密钥"}`，仅内存保存；`{"clear":true}` 清除。
- `POST /api/model/test`：执行一次极小的官方模型连通性请求，返回使用量。
- `POST /api/agent/run`：`{"base_revision":4,"prompt":"制作一把M4A1风格枪械…","budget":85}`。立即返回job id，后台执行最多7轮生成、修正和预览反馈。
- `GET /api/agent/job?id=...`：读取进度、调用使用量和结果，不返回模型凭据或内部推理文本。
- `GET /api/agent/history`：读取已保存任务。重启后恢复结果与候选。
- `POST /api/agent/cancel`：`{"id":"..."}`。
- `POST /api/agent/apply`：`{"base_revision":4,"id":"..."}`，载入已就绪候选。
- `GET /api/gun/reference`：当前存档与报告差异摘要。
- `POST /api/gun/reference/load`：`{"base_revision":4}`，加载75狐狸参考并保留撤销历史。
- `POST /api/gun/action`：`{"action":"normal"}`，可选normal/run/aim/reload/fire。reload是视觉触发，空仓fire才进入65tick补弹休止。

枪械工程的 `/api/export`、`/api/export.zip?experimental=true` 返回mccmd与纯命令文本，不返回行为包。没有重新进行网易实机验证。

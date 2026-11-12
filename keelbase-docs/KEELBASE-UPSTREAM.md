# KEELBASE-UPSTREAM — how this line stands to the tree it was derived from

> `D45`（2026-10-11）.** The decision lives in the private repository (`KeelBase-Vue-Pro/决定索引.md`);
> this page is where someone about to change an upstream file will actually read it.

This repository's history was started fresh from one upstream commit. It is not a fork in the merge
sense — but it *is* a tree with upstream's files in it, and this line has changed some of them. This is
what it is allowed to change, and where those changes are written down.

## The boundary

The RuoYi line's rule `D15` — *upstream's generated artefacts and `vm/` are never touched* — is **not
transplanted here**（`D45`). It could not be: this line's generator lives in the repository, and this
line has already changed nine of upstream's files (the patrol below reports the live number). What
replaces it:

| | |
|---|---|
| **Allowed without ceremony** | wiring (a dependency, an explicit bean name) · the build shape (which modules are in the reactor) |
| **Allowed, as its own increment** | the console's visual layer, `keelbase-ui/host-patches/` — that is **a different upstream** (`yudao-ui-admin-vue3`) |
| **Allowed, and registered below** | changing **what upstream does** — either because a governance seam needs it, or because the tree does not otherwise work (an upstream dependency moving under it, and the like) |

A change in that third row carries **three things**, and all three are the point: a **marker in the
comment** saying the change is ours, an **entry in the register below**, and a **test**. Without the
marker, the next upstream rewrite of that file is read as a whole diff; without the register, nothing
says how many such places exist; without the test, nothing says the change still holds.

## The register

| file | what it changes | why |
|---|---|---|
| `yudao-module-ai1-springai/.../harness/session/Ai1SessionStreamTool.java` | the security context upstream sets on its own threads; **the two seams it consults before running a turn** (which model, and the deployment's own tools); **the governance seam every tool now goes through**; **and the assistant turn it reports to the optional transcript listener**<br>上游在自己线程上设置的安全上下文；**它在跑一轮之前会问的两条缝**（用哪个模型、部署自己的工具）；**现在每一次工具调用都会经过的治理缝**；**它报给可选转录监听器的助手回合** | `D32` — the caller has to reach the tool's thread; the seams are the deployment's answer to a question upstream otherwise answers itself; the governance seam is what makes MCP, SKILL and RAG calls land in the engine; the transcript listener is what lets a deployment's trace page see the turn at all<br>`D32` —— 调用方必须到达工具所在线程；两条缝是部署方对「上游本来自己回答的问题」的回答；治理缝让 MCP、SKILL 与 RAG 调用都落进引擎；转录监听器让部署方的轨迹页**看得见**这一轮 |
| `yudao-module-ai1-springai/.../harness/mcp/Ai1McpToolFactory.java` | the caller and session captured where the tool is assembled; **and the governed callback: the call goes through `Ai1ToolGovernor`, not straight to the MCP client**<br>工具被**装配**时捕获调用方与会话号；**以及受治理的回调：调用经 `Ai1ToolGovernor`，不再直连 MCP 客户端** | `D32` — the same seam, at assembly; without the session a governed MCP call's row can only be read as "this caller's recent calls"; the governor is what puts the call under the engine's gate and audit |
| `yudao-module-ai1-springai/.../harness/skill/Ai1SkillToolFactory.java` + `.../harness/skill/Ai1SkillExecutionContext.java` (**a file added inside the module**) | the SKILL tools assembled as governed callbacks; the per-agent delegate travels in the thread context, because a tool's name is stable while its sandbox is per agent<br>SKILL 工具装配成受治理的回调；每个 agent 的 delegate 走线程上下文——工具名稳定，而沙箱是每个 agent 自己的 | a SKILL call now reaches the engine (authorized, audited); the context is how one stable tool name runs in each agent's own sandbox |
| `yudao-module-ai1-springai/.../harness/rag/Ai1RagTool.java` | the advisor's retrieval goes through the governance seam (a governed R1 read)<br>advisor 的检索经治理缝执行（受治理的 R1 读） | every retrieval now writes an audit row, carrying the caller and the session |
| `yudao-module-ai1-springai/.../harness/llm/Ai1LlmChatTool.java` | it is handed a `ChatClient` rather than a model snapshot, and no longer builds the client itself | the deployment answers which model a session runs on — see `Ai1ChatModelResolver` |
| `yudao-module-ai1-springai/.../service/agent/Ai1AgentServiceImpl.java` | agent creation validates a model by asking the same resolver the session asks | a model this deployment cannot reach is refused when the agent is written, rather than surfacing as a failed session later |
| `yudao-module-ai1-springai/.../harness/llm/Ai1ChatModelResolver.java` + `.../harness/local/Ai1LocalToolProvider.java` (**files added inside the module**) | the two seams the entries above consult — the tool one taking the **session id** as well as the agent | the model comes from the deployment's own catalogue, and an agent can reach the runtime's governed tools **attributably**: without the session, no row a governed call writes can be read per turn |
| `yudao-module-ai1-springai/.../harness/session/Ai1TranscriptListener.java` (**a file added inside the module**) + its calls in `Ai1SessionMessageServiceImpl.java` and `Ai1SessionStreamTool.java`<br>**（模块内新增文件）**及其在 `Ai1SessionMessageServiceImpl.java` 与 `Ai1SessionStreamTool.java` 中的调用 | an optional seam a deployment may fill to keep its own copy of each turn; with no implementation the module writes only its own rows<br>部署方可选填的一条缝，用来留每个回合自己的副本；没有实现时模块只写自己的行 | the assistant's turns otherwise never reach the deployment's conversation store, so the runtime's decision-trace page lists nothing for a turn taken through the assistant even though the audit and effect rows carry its session id<br>否则助手的回合永远到不了部署方的会话存储，于是运行时决策轨迹页对经助手走的一轮什么也列不出——尽管审计行与副作用行都带着它的会话 id |
| `yudao-module-report/.../goview/GoViewProjectMapper.java` | the creator is bound as a string | PostgreSQL refuses the coercion MySQL performs |
| `yudao-framework/.../swagger/config/YudaoSwaggerWebConfiguration.java` + its registration in that starter's `AutoConfiguration.imports` | a new auto-configuration inside upstream's own package, and the one line that switches it on | springdoc 3.0.3 and Boot 4.x disagree about the `api-docs` endpoint's declared return type, and it throws without this（`dcd9c6b548`） |

The rest of the footprint is wiring, documents and the test that covers one of the entries above:
`README.md` · both `pom.xml` · `AuthController.java` · `Ai1McpToolFactoryTest.java` ·
`Ai1SkillToolFactoryTest.java` · and the added tree (this line's seams, generator, console layer,
deployment, scripts, SQL, docs).

⚠ The third row was **widened on 2026-10-12**, and that is why the Swagger entry above belongs there:
it is not a governance seam, it is a change the tree needs in order to work at all. Until then the row
read "when a governance seam needs it", which was narrower than this register — the gap was found by
taking the patrol's own advice and looking, not by reading the register and trusting it.

## Measuring, rather than gate-keeping

```bash
node scripts/check-upstream-footprint.mjs
```

It diffs against **the tag this repository carries** (`upstream-pin-994605b`), not the moving remote —
a comparison against the remote would add upstream's own progress to this line's number. It reports
deleted / added / modified, names the modified files with their line counts, lists added files that
landed in directories upstream already owns, and reports the console patch separately as a count of
the files it reaches.

It has **no red light on purpose**. Upstream moving, and this line moving with it, are both normal; a
patrol that fails is a patrol nobody reads. It prints when the footprint grows past the last reading,
and that is a reminder to look — then to update the reading in the script.

## The executable bit

About 130 files differ from upstream by their executable bit alone, which they lost when the tree came
across Windows. **This line does not maintain the mode**（`D45`）, and the patrol excludes mode-only
differences so they are not reported as changes. Restoring them would be its own change, with its own
reason; it is not needed for anything here to work.

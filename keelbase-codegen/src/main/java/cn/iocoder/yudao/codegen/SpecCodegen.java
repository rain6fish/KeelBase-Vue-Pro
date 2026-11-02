// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.codegen;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Turn a Business Spec into what this host needs for a governed module: the DDL that creates its
 * table, and the two files of ours that give it an AI tool face and a row-scope pointcut.
 *
 * <pre>
 *   bash scripts/gen-from-spec.sh specs/products.json
 *   bash scripts/gen-from-spec.sh specs/products.json --check
 * </pre>
 *
 * <p>What this does <b>not</b> do: it does not generate the module's own CRUD. That is this host's own
 * code generator, driven over its API — a separate step, because it needs a running stack. This half is
 * deterministic and offline, which is what makes it checkable: {@code --check} compares what it would
 * write against what is on disk and exits non-zero on any drift.
 *
 * <p>It used to be a Node script ({@code scripts/keelbase-gen-from-spec.mjs}, inherited from the RuoYi
 * line). It moved here because <b>what it emits is Java</b>, and a Java host line whose generator is
 * JavaScript is a seam that has to be explained every time someone reads it. The port is held to the
 * same judgement the previous version was: it has to reproduce the committed artifacts, and the
 * artifacts it produces now say so in their provenance line.
 *
 * 把一份 Business Spec 变成这个宿主需要的两样东西：建表的 DDL，以及**我们自己的**两个文件——AI 工具面与行范围切点。
 *
 * <pre>
 *   bash scripts/gen-from-spec.sh specs/products.json
 *   bash scripts/gen-from-spec.sh specs/products.json --check
 * </pre>
 *
 * <p><b>不做</b>的事：不生成模块自己的 CRUD。那是这个宿主自己的代码生成器干的、经它的 API 驱动——**另一趟**，因为它
 * 需要一套跑着的栈。这一半是确定性的、离线的，而正因如此它才**可核**：{@code --check} 拿「它会写的」比对「盘上的」，
 * 有漂移就非零退出。
 *
 * <p>它原本是一个 Node 脚本（{@code scripts/keelbase-gen-from-spec.mjs}，从 RuoYi 线继承）。搬到这里，是因为
 * **它产出的东西就是 Java**；而一条「Java 宿主线配 JS 生成器」的缝，每换一个人读都要解释一遍。这次移植被钉在它上一版
 * 那条**同一条判据**上：必须能复现已提交的产物——而它现在产出的东西，**出处行**里写着这一点。
 *
 * <p>This class is the entry point and nothing else: it parses the arguments, resolves the repository
 * root, asks the three generators for their text, and writes or drift-checks what comes back. The work
 * is split by responsibility beside it — {@link Spec} reads a Spec, {@link Types} owns the type
 * vocabulary, {@link DdlGenerator} / {@link ToolsGenerator} / {@link GovernanceGenerator} each emit one
 * artefact, and {@link Boundary} runs the boundary check. The namespace ({@code GENERATED_DIR}) and the
 * hand-written declaration ({@code HAND_WRITTEN}) stay here, because this is the file the docs point at
 * when they say a new hand-written file has to be declared.
 *
 * <p>本类只是入口：解析参数、定位仓库根、向三个生成器取文本，再写出或比对漂移。活儿按职责拆在它旁边——
 * {@link Spec} 读规格、{@link Types} 管类型词表、{@link DdlGenerator} / {@link ToolsGenerator} /
 * {@link GovernanceGenerator} 各出一份产物、{@link Boundary} 跑边界检查。命名空间（{@code GENERATED_DIR}）
 * 与手写声明（{@code HAND_WRITTEN}）留在这里，因为仓内文档说「新增手写文件必须声明」时指的就是本文件。
 */
public final class SpecCodegen {

    /** Where the two seam files go. Names the module the host generates, not one we own. */
    static final List<String> GENERATED_DIR = List.of(
            "yudao-server", "src", "main", "java", "cn", "iocoder", "yudao", "server", "keelbase", "generated");

    /**
     * The seam files a host line writes <b>once</b>, which no Spec produces — declared so that the
     * boundary is something the build can check rather than a claim in a document, and so that a file
     * belonging to neither list fails instead of quietly becoming a second source.
     *
     * <p>This is the answer to the boundary question `RY-38` closed with: the adapter owns the
     * <em>module-level</em> surface (the table, the tool face, the row-scope pointcut), and a host line
     * writes its <em>host-level</em> pieces by hand exactly once. Within these two namespaces that is
     * now enforced rather than described — and the enforcement is worth having because the namespaces
     * do not distinguish the two by name: `sql/keelbase-products.sql` is generated and
     * `sql/keelbase-crm.sql` is hand-written, side by side.
     *
     * 一条宿主线**只写一次**、而任何 Spec 都不产出的接缝文件——声明在此，好让这条边界成为**构建能检查**的东西，
     * 而不是文档里的一句主张；也好让「两边都不属于」的文件**报错**，而不是悄悄变成第二个源。
     *
     * <p>这是 `RY-38` 收口时留下的那个边界问题的答案：适配器拥有**模块级**面（表 · 工具面 · 行范围切点），
     * 宿主级件由宿主线**手写一次**。在这两个命名空间之内，这一点现在**是被强制**的、不是被描述的——而这条强制值得
     * 有，因为命名空间**并不靠名字区分两者**：`sql/keelbase-products.sql` 是生成的、`sql/keelbase-crm.sql` 是手写的，
     * 并排放在一起。
     */
    static final List<String> HAND_WRITTEN = List.of(
            // YD-2: an upstream module whose schema upstream does not publish, so it was derived once.
            // YD-2：一个上游不发布其 schema 的上游模块，故它被推导了一次。
            "sql/keelbase-crm.sql",
            // ai1: enabled and compiled with no schema of its own, so its endpoints answered 500 until
            // this file existed. Upstream publishes no DDL for it either.
            // ai1：被启用、被编译，却没有自己的 schema，故在本文件存在之前它的端点一律答 500。上游同样不发布它的 DDL。
            "sql/keelbase-ai1.sql",
            // The deployment's own names, replacing the platform vendor's — a file of ours rather than
            // edits scattered through upstream's several-thousand-line, multi-dialect seed.
            // 本部署自己的名字，替换掉平台厂商的——写成我们自己的一个文件，而不是在上游那份几千行、多方言的种子里散改。
            "sql/keelbase-brand-names.sql",
            // The host writes NULL for "nobody is logged in"; MySQL coerced it, PostgreSQL refuses.
            // Relaxing the column is what keeps that row rather than dropping it.
            // 宿主对「没有登录用户」写 NULL；MySQL 会强转，PostgreSQL 拒绝。放宽该列，那一行才留得住而不是丢掉。
            "sql/keelbase-operate-log-nullable.sql",
            // Upstream's seed carries pictures hosted on the vendor's own file server. A deployment
            // that keeps them asks every visitor to fetch from a host we do not control, so the rows
            // are pointed at what this host serves.
            // 上游种子里带着挂在厂商自己文件服务器上的图片。沿用它们的部署会让每个访问者去一个我们并不
            // 控制的主机取图，故把这些行指向本机自己提供的东西。
            "sql/keelbase-local-images.sql",
            // The modules this line enables wholesale. Upstream ships a test schema per module — in a
            // mix of dialects, and not always covering the module's own data objects — so each was
            // converted (and, where the schema fell short, derived) once, by hand, into these files.
            // 本线整体启用的那些模块。上游给每个模块带一份测试 schema——方言混杂，而且未必覆盖该模块自己的
            // 数据对象——故逐份转换（schema 不够的地方则推导）成这些文件，一次性做完。
            "sql/keelbase-bpm.sql",
            "sql/keelbase-report.sql",
            "sql/keelbase-oa.sql",
            "sql/keelbase-hrm.sql",
            "sql/keelbase-fms.sql",
            "sql/keelbase-pms.sql",
            "sql/keelbase-ai.sql",
            // What MySQL has and PostgreSQL does not: some date-part function names (`MONTH(...)` is
            // built in Java by a few of the enabled modules) and one operator (`smallint = boolean`,
            // which two callers need at once on the same column). Supplied here rather than by editing
            // upstream's Java or by retyping a column.
            // MySQL 有、PostgreSQL 没有的东西：几个日期分量函数名（少数启用的模块在 Java 里拼
            // `MONTH(...)`），以及**一个算符**（`smallint = boolean`——两个调用方在同一列上同时需要它）。
            // 补在这里，而不是去改上游的 Java 或把某一列改型。
            "sql/keelbase-mysql-compat.sql",
            // A seeded menu routes to something that was never a page; its four `type = 3` children
            // are the button permissions the dialog beside it checks, so they are re-parented to the
            // page that uses them before the bogus row is switched off.
            // 一条种子菜单路由到一个**从来不是页面**的东西上；它那四个 `type = 3` 子行是旁边那个弹窗要检查的
            // 按钮权限，故先把它们改挂到真正使用它们的页面上，再把那行关掉。
            "sql/keelbase-menus-without-pages.sql",
            // The governance console's own menu rows: one directory and the three pages under it.
            // Inserts only, because this host builds its tree from `system_menu` and a .vue file nobody
            // lists is a page nobody can reach. No permission string and no role grant, so who sees them
            // stays the host's own rule rather than this file's.
            // 治理控制台自己的菜单行：一个目录与它下面那三页。**只有插入**，因为本宿主的树是从 `system_menu`
            // 建的，而一个没人登记的 .vue 就是一个没人到得了的页面。不挂权限串、也不授角色，故谁能看到它们由
            // **宿主自己的规则**决定、不由本文件决定。
            "sql/keelbase-governance-menus.sql",
            // ...and who may see them. The directory and two of the three pages go to the ordinary
            // role, because the server already scopes each of those to its caller — so handing them out
            // adds no reach. The audit chain is granted to nobody: the runtime refuses it to anyone who
            // is not an administrator, and a menu is not a permission.
            // ……以及**谁看得到它们**。那个目录与三页里的两页交给普通角色，因为服务端**本来就**把这两页按调用方
            // 限了范围 —— 于是把它们发出去**一点射程也没加**。审计链不授给任何人：运行时把它拒给任何不是管理员的
            // 人，而**菜单不是权限**。
            "sql/keelbase-governance-menu-grants.sql",
            // Where a deployment's uploads go. Upstream's seed makes an *example* store master with
            // the vendor's own domain in it, so uploads belong on a server we do not control. Takes
            // the origin as a parameter, so one file serves every host running this stack.
            // 一次部署的上传落到哪里。上游种子把一份**示例**存储设成 master、里面写着厂商自己的域名，
            // 于是上传属于一个我们并不控制的服务器。它把 origin 作参数收下，故一个文件伺候所有跑这套栈的机器。
            // The console's per-page menu rows, one file each. Each is a hand-written addition to the
            // host's own menu tree rather than a Spec's output, so each has to be declared here or the
            // boundary check calls it UNDECLARED — which is what it did for the three added before this
            // one, and the check had been red since.
            // 控制台逐页的菜单行，一份一个文件。每一份都是对**宿主自己**菜单树的手写新增、不是 Spec 的产出，
            // 故每一份都必须在此声明，否则边界检查会把它判成 UNDECLARED —— 在本次之前加的那三份正是如此，
            // 而那道检查从那时起一直是红的。
            "sql/keelbase-showcase-menu.sql",
            "sql/keelbase-tool-inventory-menu.sql",
            "sql/keelbase-trace-menu.sql",
            "sql/keelbase-operation-audit-menu.sql",
            "sql/keelbase-policy-menu.sql",
            "sql/keelbase-file-storage.sql",
            // 助手那一对：它的常驻 agent（模型链 + 系统提示词）写成**种子**、而不是手敲的三步，故
            // 「改了可评审、部署可复现」；密钥不进仓——provider 的 `api_key` 是嵌套默认值，落到本部署
            // 已经在传的那个模型 key 上。它的授权把 `ai1:session:my` 给普通角色：ai1 从来不带界面，
            // 故这条权限此前**一行都不存在**，而宿主的权限清单是从被授予的菜单行上读的。
            //
            // The assistant pair: its resident agent — the model chain and the system prompt — as a seed
            // rather than a hand-typed three-step, so a change to it is reviewable and a deployment
            // reproducible; the key stays out of the repository, because the provider's `api_key` is a
            // nested default that falls back to the model key this deployment already passes. The grant
            // hands `ai1:session:my` to the ordinary role: `ai1` ships no menus, so that permission had
            // no row at all before it, and the host reads its permission list off granted menu rows.
            "sql/keelbase-assistant-agent.sql",
            "sql/keelbase-assistant-role-grants.sql",
            // 本部署自己的名字与状态，写成文件而不是散改上游的种子：自带 AI 模块的**应用面**在菜单层
            // 关停（只关菜单，不删代码、不删表），以及「MySQL 监控」改名「数据库监控」、那一格随 Hikari 写。
            //
            // This deployment's own names and state, as files rather than edits scattered through
            // upstream's seed: the built-in AI module's application surface switched off at the menu
            // layer (menus only — no code and no table is deleted), and the monitor page renamed with
            // that cell following Hikari.
            "sql/keelbase-ai-app-surface-off.sql",
            "sql/keelbase-monitor-rename.sql",
            // 本部署的**样例业务数据**（六家客户、三位联系人、三条跟进、六个产品）。**带外灌入**：它不属于
            // 「表 + 菜单」的部署引导，而是给某一套开发/演示环境看的样例。固定 id（9xxx 段）+ 缺了才插，故重跑
            // 不翻倍 —— 正是这一点让它值得留在仓里，而不是某一次手敲的 INSERT。
            //
            // This deployment's **sample business data** — six customers, three contacts, three follow-up
            // records and six products. Applied **out of band**: it is not part of the tables-and-menus
            // bootstrap every deployment runs, but sample data for one development/demo environment. Fixed
            // ids in the 9xxx band and inserted only when absent, so rerunning it does not double the rows —
            // which is exactly why it belongs in the repository rather than in a one-off hand-typed INSERT.
            "sql/keelbase-demo-data.sql",
            // 控制台菜单行，补登记：助手管理台七页（`sql/keelbase-assistant-menus.sql`，`0aa847201c` 引入）与
            // 治理边界页那条菜单行 + 授予（`sql/keelbase-boundary-menu.sql`，`23e32af967` 引入）。两者都是**手写**、
            // 任何 Spec 都不产出，引入时漏了在此声明 ⇒ 边界检查自那时起一直把两者报成 UNDECLARED。补声明 = 让声明
            // **追上事实**；这道检查的判据一字未松，只是它终于知道了这两份文件的存在。
            //
            // Two more hand-written files, declared here at last: the assistant console's seven menu rows
            // (`sql/keelbase-assistant-menus.sql`, landed in `0aa847201c`) and the governance boundary page's
            // menu row plus its grant (`sql/keelbase-boundary-menu.sql`, landed in `23e32af967`). Both are
            // hand-written and produced by no Spec; they simply were not declared here when they landed, so
            // the boundary check has called each of them UNDECLARED ever since. Declaring them lets the
            // declaration catch up with fact — not one of the check's judgements is relaxed; it merely now
            // knows these two files exist.
            "sql/keelbase-assistant-menus.sql",
            "sql/keelbase-boundary-menu.sql",
            // 审计读者的授予文件（`sql/keelbase-audit-reader.sql`，`839044a3b8` 引入、`3374c3be4d` 补授边界页）
            // 同样是手写、任何 Spec 都不产出；引入时漏了在此声明，边界检查自那时起把它判成 UNDECLARED。
            // 补声明 = 让声明**追上事实**；判据未松。
            //
            // The audit reader's grants (`sql/keelbase-audit-reader.sql`, landed in `839044a3b8`, with the
            // boundary page added in `3374c3be4d`) are hand-written too and produced by no Spec; they were
            // not declared when they landed, so the check has called the file UNDECLARED ever since.
            // Declaring it lets the declaration catch up with fact; no judgement is relaxed.
            "sql/keelbase-audit-reader.sql",
            // 审计读者的**账号**（`sql/keelbase-audit-reader-user.sql`）：`audit_reader` 角色此前只有身份、没有登录，
            // 部署齐备的库里没有人能以审计读者身份登录。本文件只插 `system_users` 一行与一行 `system_user_role`，
            // 不写任何 `system_role_menu`（授予仍全部来自上一份）。手写、任何 Spec 都不产出 ⇒ 在此声明。
            //
            // The audit reader's **account** (`sql/keelbase-audit-reader-user.sql`): the `audit_reader` role had
            // an identity but no login, so a fully seeded database had nobody who could sign in as an audit
            // reader. The file inserts one `system_users` row and one `system_user_role` row and writes no
            // `system_role_menu` (every grant still comes from the file above). Hand-written, produced by no
            // Spec, so it is declared here.
            "sql/keelbase-audit-reader-user.sql",
            // 走查读者的种子（`sql/keelbase-m7-reader.sql`，`b785afb033` 引入）：一个**非管理员**角色 `m7_reader`、
            // 它的账号 `m7reader`，以及最小的菜单授予。它同样是手写、任何 Spec 都不产出——只插、幂等，动的是
            // `system_role` / `system_users` / `system_user_role` / `system_role_menu`，且**不改** `common`；
            // 引入时同样漏了在此声明，边界检查自那时起把它判成 UNDECLARED。补声明 = 让声明**追上事实**；判据未松。
            //
            // The walkthrough reader's seed (`sql/keelbase-m7-reader.sql`, landed in `b785afb033`): a **non-admin**
            // role `m7_reader`, its account `m7reader`, and the smallest set of menu grants. It is hand-written too
            // and produced by no Spec — inserts only, idempotent, touching `system_role` / `system_users` /
            // `system_user_role` / `system_role_menu` while leaving `common` alone; it was likewise not declared
            // here when it landed, so the check has called the file UNDECLARED ever since. Declaring it lets the
            // declaration catch up with fact; no judgement is relaxed.
            "sql/keelbase-m7-reader.sql",
            // The demo accounts (`sql/keelbase-demo-accounts.sql`): the two the main repo's sign-in page
            // names — `alex`'s account, and `admin`'s password rewritten while it still holds upstream's
            // default. Hand-written, produced by no Spec, and not declared when it landed in `e672259c9f`,
            // so the boundary check has called it UNDECLARED ever since. Declaring it lets the declaration
            // catch up with fact; no judgement is relaxed.
            //
            // 演示账号（`sql/keelbase-demo-accounts.sql`）：主仓登录页上写的那两个 —— `alex` 的账号，以及
            // `admin` 的口令（仅在它仍是上游默认值时才改写）。手写、任何 Spec 都不产出，`e672259c9f` 落地时漏了
            // 在此声明，边界检查自那时起把它报成 UNDECLARED。补声明 = 让声明**追上事实**；判据一字未松。
            "sql/keelbase-demo-accounts.sql",
            // ai1 管理台的**按钮权限行**（`sql/keelbase-ai1-permissions.sql`，`9fcb3c5877` 引入、`ef02521786` 收窄成
            // 「只种行、不授予」）：那七页的菜单行由 `sql/keelbase-assistant-menus.sql` 挂出，但权限串一行都没种，故
            // 每个 `v-hasPermi` 按钮都拿不到码。手写、任何 Spec 都不产出；引入时漏了在此声明，边界检查自那时起把它
            // 报成 UNDECLARED。补声明 = 让声明**追上事实**；判据一字未松。
            //
            // The ai1 console's **button-permission rows** (`sql/keelbase-ai1-permissions.sql`, landed in
            // `9fcb3c5877` and narrowed to rows-without-grants in `ef02521786`): the seven pages' menu rows are
            // raised by `sql/keelbase-assistant-menus.sql`, but no permission string was seeded, so every
            // `v-hasPermi` button on them had no code to check. Hand-written, produced by no Spec; it was not
            // declared here when it landed, so the boundary check has called it UNDECLARED ever since.
            // Declaring it lets the declaration catch up with fact; no judgement is relaxed.
            "sql/keelbase-ai1-permissions.sql",
            // 旁路留痕表（`sql/keelbase-bypass-audit.sql`）：上游 REST 的写**只记不改**的那张表。手写、任何 Spec
            // 都不产出 —— 它不是某个业务模块的表，故没有任何 `specs/*.json` 会生成它；不在此声明就会被判成 UNDECLARED。
            //
            // The bypass trail table (`sql/keelbase-bypass-audit.sql`): the table behind "record, never
            // alter" for upstream REST writes. Hand-written and produced by no Spec — it is no business
            // module's table, so no `specs/*.json` could generate it; undeclared, the check calls it UNDECLARED.
            "sql/keelbase-bypass-audit.sql");

    private SpecCodegen() {
    }

    /**
     * 入口：把工作交给 {@link #run(String[])}，并只在这里把**读不出的规格**变成一条可读的 stderr 消息 + 非零退出。
     * 规格自相矛盾（见 {@link Spec.Cap}）时，消息点名是哪条能力、它的布尔与风险级差在哪 —— 而不是一串栈。
     *
     * <p>Entry point: hand the work to {@link #run(String[])} and, only here, turn an <b>unreadable Spec</b>
     * into a legible stderr message plus a non-zero exit. When a Spec contradicts itself (see
     * {@link Spec.Cap}) the message names which capability disagreed and by how much, rather than a stack.
     */
    public static void main(String[] args) throws IOException {
        try {
            run(args);
        } catch (IllegalArgumentException unreadable) {
            System.err.println(unreadable.getMessage());
            System.exit(1);
        }
    }

    private static void run(String[] args) throws IOException {
        boolean check = false;
        boolean boundary = false;
        String specArg = null;
        for (String arg : args) {
            if ("--check".equals(arg)) {
                check = true;
            } else if ("--check-boundary".equals(arg)) {
                boundary = true;
            } else if (!arg.startsWith("--")) {
                specArg = arg;
            }
        }
        Path root = repoRoot();
        if (boundary) {
            Boundary.check(root);
            return;
        }
        if (specArg == null) {
            System.err.println("usage: gen-from-spec.sh <spec.json> [--check] | --check-boundary");
            System.exit(2);
        }
        Spec spec = Spec.read(Path.of(specArg));

        List<Output> outputs = List.of(
                new Output(root.resolve("sql").resolve("keelbase-" + spec.module() + ".sql"), DdlGenerator.build(spec)),
                new Output(root.resolve(String.join("/", GENERATED_DIR)).resolve(spec.entity() + "Tools.java"),
                        ToolsGenerator.build(spec)),
                new Output(root.resolve(String.join("/", GENERATED_DIR)).resolve(spec.entity() + "Governance.java"),
                        GovernanceGenerator.build(spec)));

        int drift = 0;
        for (Output output : outputs) {
            String rel = root.relativize(output.path()).toString().replace('\\', '/');
            if (check) {
                if (!Files.exists(output.path())) {
                    System.err.println("  MISSING  " + rel);
                    drift += 1;
                } else if (!normalise(Files.readString(output.path(), StandardCharsets.UTF_8)).equals(output.content())) {
                    System.err.println("  DRIFT    " + rel);
                    drift += 1;
                } else {
                    System.out.println("  ok       " + rel);
                }
            } else {
                Files.createDirectories(output.path().getParent());
                Files.writeString(output.path(), output.content(), StandardCharsets.UTF_8);
                System.out.println("  wrote    " + rel);
            }
        }
        if (check && drift > 0) {
            System.err.println("\n" + drift + " file(s) differ from the spec — re-run without --check to regenerate.");
            System.exit(1);
        }
        if (check) {
            System.out.println("\nno drift.");
        }
    }

    /**
     * The repository root, which is where the run has to happen: the generator writes into paths it does
     * not own, so it refuses rather than guessing.
     *
     * 仓库根——运行必须在它那里：生成器要写进它并不拥有的路径，故它**拒绝**而不是猜。
     */
    private static Path repoRoot() {
        Path here = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        if (!Files.isDirectory(here.resolve("sql")) || !Files.isDirectory(here.resolve("yudao-server"))) {
            System.err.println("run this from the repository root (sql/ and yudao-server/ not found under " + here + ")");
            System.exit(2);
        }
        return here;
    }

    /** Compare as text with line endings normalised: this repository is checked out on Windows, so what
     * is on disk is CRLF while what is committed — and what this writes — is LF. */
    private static String normalise(String text) {
        return text.replace("\r\n", "\n");
    }

    private record Output(Path path, String content) {
    }
}

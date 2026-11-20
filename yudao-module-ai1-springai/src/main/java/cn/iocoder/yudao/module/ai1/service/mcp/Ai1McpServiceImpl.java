package cn.iocoder.yudao.module.ai1.service.mcp;

import cn.com.keelbase.runtime.audit.AuditService;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.map.MapUtil;
import cn.hutool.core.util.StrUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.json.JsonUtils;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.module.ai1.controller.admin.mcp.vo.Ai1McpConnectRespVO;
import cn.iocoder.yudao.module.ai1.controller.admin.mcp.vo.Ai1McpPageReqVO;
import cn.iocoder.yudao.module.ai1.controller.admin.mcp.vo.Ai1McpSaveReqVO;
import cn.iocoder.yudao.module.ai1.dal.dataobject.mcp.Ai1McpDO;
import cn.iocoder.yudao.module.ai1.dal.mysql.mcp.Ai1McpMapper;
import cn.iocoder.yudao.module.ai1.enums.mcp.Ai1McpTransportEnum;
import cn.iocoder.yudao.module.ai1.harness.mcp.Ai1McpClientTool;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

import java.net.URI;
import java.util.*;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.module.ai1.enums.Ai1ErrorCodeConstants.*;

/**
 * AI1 MCP 服务 Service 实现类
 *
 * @author 芋道源码
 */
@Service
@Validated
@Slf4j
public class Ai1McpServiceImpl implements Ai1McpService {

    /**
     * The audit chain's action word for a connect test. Kept apart from `tool_call`: a test dials the
     * MCP endpoint, it does not run one of its tools, and the contract's `tool_call` outcomes must not
     * be made to describe something that never was one. Everything else travels in `detail`.
     *
     * 连通测试在审计链上的动作词。与 `tool_call` 分开：测试拨的是 MCP 端点、不是它下面某个工具，而契约给
     * `tool_call` 冻结的结局词表不该被拿来描述一件从来不是工具调用的事。其余信息都写在 `detail` 里。
     */
    private static final String AUDIT_ACTION = "mcp_connect_test";

    /** The same "no identity" sentinel the runtime's own rows use. / 与运行时自己的行同一个「没有身份」哨兵。 */
    private static final String NO_IDENTITY = "0";

    /**
     * The type word the row records for the object it dialled. A readable word, never the table name
     * `ai1_mcp`: the key is part of `detail`, `detail` is part of the chain's hash payload, and the
     * console renders this object in the six answers and in the CSV export — an internal name there
     * refuses the whole export (`leaksIn`). The reader maps this word back to the type it searches by.
     *
     * 这一行记下的、它拨向的那条对象的类型词。是**可读的词**、不是表名 `ai1_mcp`：这个键属于 `detail`，
     * `detail` 属于链的哈希载荷，而控制台会把这条对象画进六问与 CSV 导出 —— 那里出现内部名会让**整份导出**
     * 被拒（`leaksIn`）。读面按这个词映射回它检索用的类型。
     */
    static final String AUDIT_OBJECT_KIND = "MCP connection";

    @Resource
    private Ai1McpMapper mcpMapper;

    @Resource
    private Ai1McpClientTool mcpClientTool;

    @Resource
    private AuditService auditService;

    @Override
    public Long createMcp(Ai1McpSaveReqVO createReqVO) {
        Ai1McpDO mcp = buildMcp(createReqVO);
        mcpMapper.insert(mcp);
        return mcp.getId();
    }

    @Override
    public void updateMcp(Ai1McpSaveReqVO updateReqVO) {
        // 1. 校验存在
        validateMcpExists(updateReqVO.getId());

        // 2. 更新：切换为本地时服务地址为空，由 updateForSave 主动置空
        mcpMapper.updateForSave(buildMcp(updateReqVO));

        // 3. 释放本节点的旧连接，下次使用时按新配置重建
        mcpClientTool.evict(updateReqVO.getId());
    }

    @Override
    public void deleteMcp(Long id) {
        deleteMcpListByIds(Collections.singletonList(id));
    }

    @Override
    public void deleteMcpListByIds(List<Long> ids) {
        // 1. 校验存在
        ids.forEach(this::validateMcpExists);

        // 2. 删除
        mcpMapper.deleteByIds(ids);

        // 3. 释放本节点的连接与子进程；其他节点的闲置连接按访问过期自动释放
        ids.forEach(mcpClientTool::evict);
    }

    @Override
    public Ai1McpDO getMcp(Long id) {
        return mcpMapper.selectById(id);
    }

    @Override
    public PageResult<Ai1McpDO> getMcpPage(Ai1McpPageReqVO pageReqVO) {
        return mcpMapper.selectPage(pageReqVO);
    }

    @Override
    public List<Ai1McpDO> getMcpListByStatus(Integer status) {
        return mcpMapper.selectListByStatus(status);
    }

    @Override
    public List<Ai1McpDO> getMcpList(Collection<Long> ids) {
        if (CollUtil.isEmpty(ids)) {
            return Collections.emptyList();
        }
        return mcpMapper.selectByIds(ids);
    }

    /**
     * Test one MCP endpoint, leaving one row on the host's audit chain for every attempt.
     *
     * <p>The row is written here rather than in the controller so that any caller of the service leaves
     * the same trail. A failing row is not a failed request: the endpoint's answer is unchanged, and an
     * audit that cannot be written is reported on the log rather than turned into a 500 — the trail is a
     * side channel, not the result.
     *
     * <p>The action is {@value #AUDIT_ACTION} with no `outcome`, which the contract allows for an action
     * outside the tool vocabulary. What the row must answer is in `detail`: which MCP, which host it was
     * dialled at, whether it worked, how long it took, and — when it did not — the error's category. The
     * sentence ends with a typed key (` · object MCP connection #12`) so the row can be found by object
     * even though a test produces no ledger row: the ledger is the read face's first road, this is the
     * second.
     *
     * 测试一个 MCP 端点，每一次尝试都在宿主的审计链上留一行。
     *
     * <p>行写在这里、不写在 controller，于是经由 service 的任何调用方都留下同一条痕迹。失败的行不等于
     * 失败的请求：端点照原样作答，写不进审计只记在日志上、不变 500 —— 痕迹是旁路，不是结果。
     *
     * <p>动作是 {@value #AUDIT_ACTION}、不带 `outcome`，契约对工具词表之外的动作正是这么允许的。这一行要回答
     * 的东西都在 `detail` 里：哪一个 MCP、拨向哪个 host、通没通、花了多久，以及没通时的错误类别。句子末尾带一个
     * 带类型的键（` · object MCP connection #12`），于是即便测试不产生台账行，这一行也能按对象找到：台账是读面的
     * 第一条路，这是第二条。
     */
    @Override
    public Ai1McpConnectRespVO testMcpConnect(Long id) {
        Ai1McpDO mcp = validateMcpExists(id);
        long startTime = System.currentTimeMillis();
        Ai1McpConnectRespVO result;
        try {
            result = mcpClientTool.testConnect(mcp);
        } catch (RuntimeException e) {
            // A call that never got an answer still reached out; an exception must not erase that.
            // 没答上来的一次调用也已经伸了手；异常不能把这件事抹掉。
            recordConnectAudit(mcp, false, System.currentTimeMillis() - startTime, errorCategory(e),
                    e.getMessage());
            throw e;
        }
        boolean connectable = Boolean.TRUE.equals(result.getConnectable());
        long elapsedMs = result.getElapsedMs() != null
                ? result.getElapsedMs() : System.currentTimeMillis() - startTime;
        recordConnectAudit(mcp, connectable, elapsedMs,
                connectable ? "none" : errorCategory(result.getMessage()),
                connectable ? null : result.getMessage());
        return result;
    }

    private void recordConnectAudit(Ai1McpDO mcp, boolean connectable, long elapsedMs, String errorCategory,
                                    String message) {
        // Everything below is the side channel: a malformed stored config or an unreachable audit table
        // must not turn into the endpoint's answer.
        // 以下全是旁路：存坏的配置或连不上的审计表，都不能变成端点给出的答案。
        try {
            String detail = "mcp test id=" + mcp.getId()
                    + " name=" + mcp.getName()
                    + " transport=" + mcp.getTransport()
                    + " target=" + targetOf(mcp)
                    + " result=" + (connectable ? "ok" : "failed")
                    + " elapsedMs=" + elapsedMs
                    + " error=" + errorCategory
                    + (StrUtil.isBlank(message) ? "" : " message=" + clip(message))
                    // The typed object key goes last, and only at the end, so the reader can take it
                    // off the sentence without guessing. A test produces no ledger row: this is the
                    // only place the row says which object it was about.
                    // 带类型的对象键放在**最后**、也只在句末，读面才能不猜地从这句话上取下来。测试不产生台账行：
                    // 这一行说得出它是关于哪条对象，靠的就是这里。
                    + " · object " + AUDIT_OBJECT_KIND + " #" + mcp.getId();
            Long caller = SecurityFrameworkUtils.getLoginUserId();
            auditService.append(AUDIT_ACTION, caller == null ? NO_IDENTITY : String.valueOf(caller),
                    detail, !connectable, null, null);
        } catch (RuntimeException e) {
            log.warn("[testMcpConnect][MCP({}) 审计行写入失败]", mcp.getId(), e);
        }
    }

    /**
     * Where the test dialled: a remote URL's host (with its port, when it names one), or a stdio
     * command's name. Credentials and paths stay out of the row — the question is "which host", not
     * "what exactly was the request".
     *
     * 测试拨向哪里：远程是 URL 的 host（写了端口就连端口），本地是命令名。凭据与路径不进这一行 —— 它要回答
     * 的是「哪个 host」，而不是「请求原文是什么」。
     */
    private static String targetOf(Ai1McpDO mcp) {
        if (Ai1McpTransportEnum.isStdio(mcp.getTransport())) {
            Map<String, Object> config = JsonUtils.parseMap(mcp.getConfig());
            Object command = config == null ? null : config.get("command");
            return "stdio:" + (command == null ? "unknown" : clip(String.valueOf(command)));
        }
        String url = mcp.getUrl();
        if (StrUtil.isBlank(url)) {
            return "unknown";
        }
        try {
            URI uri = URI.create(url);
            String host = uri.getHost();
            if (StrUtil.isBlank(host)) {
                return clip(url);
            }
            return uri.getPort() > 0 ? host + ":" + uri.getPort() : host;
        } catch (IllegalArgumentException invalidUrl) {
            return clip(url);
        }
    }

    /**
     * The category of a failure, with the cause chain folded in. A wrapper's message can be a sentence
     * that names nothing ("Client failed to initialize by explicit API call"), while the chain's classes
     * say what happened; both are read, and the mapping below stays the same.
     *
     * 失败的类别，把因果链折进来。包装异常的消息可能是一句什么都不指名的话（「Client failed to
     * initialize by explicit API call」），而链上的类名说明了发生了什么；两者都读，下面的映射不变。
     */
    private static String errorCategory(Throwable failure) {
        StringBuilder words = new StringBuilder();
        Throwable cause = failure;
        for (int depth = 0; cause != null && depth < 5; depth++) {
            words.append(cause.getClass().getSimpleName()).append(' ');
            if (StrUtil.isNotBlank(cause.getMessage())) {
                words.append(cause.getMessage()).append(' ');
            }
            cause = cause.getCause() == cause ? null : cause.getCause();
        }
        return errorCategory(words.toString());
    }

    /**
     * The category, not the whole sentence: a reader filtering the chain asks "timeouts or refusals",
     * and the wording of an exception is the implementer's to change.
     *
     * 要的是类别、不是整句话：在链上筛行的读者问的是「超时还是拒绝」，而异常的措辞是实现方可改的东西。
     */
    private static String errorCategory(String message) {
        if (StrUtil.isBlank(message)) {
            return "unknown";
        }
        String lower = message.toLowerCase(Locale.ROOT);
        if (message.contains("配置不完整")) {
            return "config";
        }
        if (lower.contains("timed out") || lower.contains("timeout") || message.contains("超时")) {
            return "timeout";
        }
        // Class names count too: a JDK connect failure can carry no message at all, and the chain's
        // class is then the only word that says what happened.
        // 类名也算在内：JDK 的建连失败可能一个字的 message 都没有，链上的类名就是唯一说明发生了什么的东西。
        if (lower.contains("unknownhost") || lower.contains("unresolvedaddress")
                || lower.contains("name or service not known") || lower.contains("nodename nor servname")) {
            return "dns";
        }
        if (lower.contains("connection refused") || lower.contains("connection reset")
                || lower.contains("connectexception") || lower.contains("closedchannel")) {
            return "connect";
        }
        if (lower.contains("unauthorized") || lower.contains("forbidden")
                || lower.contains(" 401") || lower.contains(" 403")) {
            return "auth";
        }
        return "other";
    }

    private static String clip(String text) {
        String flat = text.replaceAll("\\s+", " ").trim();
        return flat.length() <= 160 ? flat : flat.substring(0, 160);
    }

    private Ai1McpDO validateMcpExists(Long id) {
        Ai1McpDO mcp = mcpMapper.selectById(id);
        if (mcp == null) {
            throw exception(MCP_NOT_EXISTS);
        }
        return mcp;
    }

    /**
     * 校验并归一化 MCP 配置，保证传输方式、config、平铺列一致：
     * 1. 传输方式以 transport 列为准，写回 config 的 transport 字段
     * 2. 远程：服务地址优先取平铺列，为空时取 config.url；请求头以平铺列为准，统一写回 config
     * 3. 本地：config 必须包含 command，服务地址置空
     */
    private Ai1McpDO buildMcp(Ai1McpSaveReqVO reqVO) {
        // 1.1 解析 config
        Map<String, Object> config = new LinkedHashMap<>();
        if (StrUtil.isNotBlank(reqVO.getConfig())) {
            Map<String, Object> configMap = JsonUtils.parseMap(reqVO.getConfig());
            if (configMap == null) {
                throw exception(MCP_CONFIG_INVALID);
            }
            config.putAll(configMap);
        }
        // 1.2 传输方式以列为准
        config.put("transport", reqVO.getTransport());

        // 2. 按传输方式校验必填项
        String url = StrUtil.blankToDefault(reqVO.getUrl(), MapUtil.getStr(config, "url"));
        Map<String, String> headers = reqVO.getHeaders();
        if (Ai1McpTransportEnum.isStdio(reqVO.getTransport())) {
            if (StrUtil.isBlank(MapUtil.getStr(config, "command"))) {
                throw exception(MCP_COMMAND_REQUIRED);
            }
            url = null;
        } else {
            if (StrUtil.isBlank(url)) {
                throw exception(MCP_URL_REQUIRED);
            }
            config.put("url", url);
            // 空请求头统一保存为空集合，避免更新时跳过 null 后残留旧鉴权
            headers = MapUtil.emptyIfNull(headers);
            if (MapUtil.isNotEmpty(headers)) {
                config.put("headers", headers);
            } else {
                config.remove("headers");
            }
        }

        // 3. 构建
        return BeanUtils.toBean(reqVO, Ai1McpDO.class).setUrl(url).setHeaders(headers)
                .setConfig(JsonUtils.toJsonString(config));
    }

}

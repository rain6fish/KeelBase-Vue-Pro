package cn.iocoder.yudao.module.ai1.service.mcp;

import cn.com.keelbase.runtime.audit.AuditChainHead;
import cn.com.keelbase.runtime.audit.AuditChainHeadRepository;
import cn.com.keelbase.runtime.audit.AuditLog;
import cn.com.keelbase.runtime.audit.AuditLogRepository;
import cn.com.keelbase.runtime.audit.AuditService;
import cn.com.keelbase.runtime.governance.GovernancePolicyStore;
import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.framework.common.util.json.JsonUtils;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.test.core.ut.BaseDbUnitTest;
import cn.iocoder.yudao.module.ai1.controller.admin.mcp.vo.Ai1McpConnectRespVO;
import cn.iocoder.yudao.module.ai1.controller.admin.mcp.vo.Ai1McpSaveReqVO;
import cn.iocoder.yudao.module.ai1.dal.dataobject.mcp.Ai1McpDO;
import cn.iocoder.yudao.module.ai1.dal.mysql.mcp.Ai1McpMapper;
import cn.iocoder.yudao.module.ai1.enums.mcp.Ai1McpTransportEnum;
import cn.iocoder.yudao.module.ai1.harness.mcp.Ai1McpClientTool;
import jakarta.annotation.Resource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import static cn.iocoder.yudao.framework.test.core.util.AssertUtils.assertServiceException;
import static cn.iocoder.yudao.module.ai1.enums.Ai1ErrorCodeConstants.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * {@link Ai1McpServiceImpl} 的单元测试
 *
 * @author 芋道源码
 */
@Import(Ai1McpServiceImpl.class)
public class Ai1McpServiceImplTest extends BaseDbUnitTest {

    @Resource
    private Ai1McpServiceImpl mcpService;

    @Resource
    private Ai1McpMapper mcpMapper;

    @MockitoBean
    private Ai1McpClientTool mcpClientTool;

    @MockitoBean
    private AuditService auditService;

    @AfterEach
    public void restoreAuditService() {
        // The audit tests swap in a real AuditService; the context is shared, so put the mock back.
        // 审计测试会换进真的 AuditService；上下文是共享的，测试完把 mock 放回去。
        ReflectionTestUtils.setField(mcpService, "auditService", auditService);
        SecurityContextHolder.clearContext();
    }

    @Test
    public void testCreateMcp_httpGenerateConfig() {
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp").setHeaders(Collections.singletonMap("Authorization", "Bearer x"));

        // 调用
        Long id = mcpService.createMcp(reqVO);
        // 断言
        Ai1McpDO mcp = mcpMapper.selectById(id);
        assertEquals("Bearer x", mcp.getHeaders().get("Authorization"));
        Map<String, Object> config = JsonUtils.parseMap(mcp.getConfig());
        assertEquals("http", config.get("transport"));
        assertEquals("http://127.0.0.1:8081/mcp", config.get("url"));
        assertEquals("Bearer x", ((Map<?, ?>) config.get("headers")).get("Authorization"));
    }

    @Test
    public void testCreateMcp_transportColumnWins() {
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.STDIO.getTransport()).setUrl("http://ignored")
                .setConfig("{\"transport\":\"http\",\"command\":\"npx\",\"args\":[\"-y\",\"server\"]}");

        // 调用
        Long id = mcpService.createMcp(reqVO);
        // 断言
        Ai1McpDO mcp = mcpMapper.selectById(id);
        assertEquals("stdio", mcp.getTransport());
        assertNull(mcp.getUrl());
        assertEquals("stdio", JsonUtils.parseMap(mcp.getConfig()).get("transport"));
    }

    @Test
    public void testCreateMcp_stdioWithoutCommand() {
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.STDIO.getTransport()).setConfig("{\"args\":[]}");

        // 调用，并断言异常
        assertServiceException(() -> mcpService.createMcp(reqVO), MCP_COMMAND_REQUIRED);
    }

    @Test
    public void testCreateMcp_httpWithoutUrl() {
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport());

        // 调用，并断言异常
        assertServiceException(() -> mcpService.createMcp(reqVO), MCP_URL_REQUIRED);
    }

    @Test
    public void testCreateMcp_configInvalid() {
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport()).setConfig("[1,2]");

        // 调用，并断言异常
        assertServiceException(() -> mcpService.createMcp(reqVO), MCP_CONFIG_INVALID);
    }

    @Test
    public void testUpdateMcp_switchToStdioClearsUrl() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport()).setUrl("http://127.0.0.1:8081/mcp"));
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.STDIO.getTransport()).setId(id)
                .setConfig("{\"command\":\"uvx\"}");

        // 调用
        mcpService.updateMcp(reqVO);
        // 断言
        Ai1McpDO mcp = mcpMapper.selectById(id);
        assertEquals("stdio", mcp.getTransport());
        assertNull(mcp.getUrl());
        verify(mcpClientTool).evict(id);
    }

    @Test
    public void testUpdateMcp_httpEvictCache() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp"));
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport()).setId(id)
                .setUrl("http://127.0.0.1:8082/mcp").setHeaders(Map.of("Authorization", "Bearer new"))
                .setConfig("{\"url\":\"http://127.0.0.1:8081/mcp\",\"headers\":{\"Authorization\":\"Bearer old\"}}");

        // 调用
        mcpService.updateMcp(reqVO);
        // 断言
        Ai1McpDO mcp = mcpService.getMcp(id);
        assertEquals(reqVO.getUrl(), mcp.getUrl());
        assertEquals(reqVO.getHeaders(), mcp.getHeaders());
        Map<String, Object> config = JsonUtils.parseMap(mcp.getConfig());
        assertEquals(reqVO.getUrl(), config.get("url"));
        assertEquals(reqVO.getHeaders(), config.get("headers"));
        verify(mcpClientTool).evict(id);
    }

    @ParameterizedTest
    @NullSource
    @MethodSource("emptyHeaders")
    public void testUpdateMcp_clearHeaders(Map<String, String> headers) {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp").setHeaders(Map.of("Authorization", "Bearer old")));
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport()).setId(id)
                .setUrl("http://127.0.0.1:8081/mcp").setHeaders(headers)
                .setConfig("{\"transport\":\"http\",\"url\":\"http://127.0.0.1:8081/mcp\","
                        + "\"headers\":{\"Authorization\":\"Bearer old\"}}");

        // 调用
        mcpService.updateMcp(reqVO);
        // 断言
        Ai1McpDO mcp = mcpService.getMcp(id);
        assertTrue(mcp.getHeaders().isEmpty());
        assertFalse(JsonUtils.parseMap(mcp.getConfig()).containsKey("headers"));
        verify(mcpClientTool).evict(id);
    }

    @Test
    public void testCreateMcp_headersColumnWins() {
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp").setHeaders(Map.of("Authorization", "Bearer column"))
                .setConfig("{\"headers\":{\"Authorization\":\"Bearer config\"}}");

        // 调用
        Long id = mcpService.createMcp(reqVO);
        // 断言平铺请求头覆盖 config 中的旧请求头
        Ai1McpDO mcp = mcpService.getMcp(id);
        assertEquals(reqVO.getHeaders(), mcp.getHeaders());
        assertEquals(mcp.getHeaders(), JsonUtils.parseMap(mcp.getConfig()).get("headers"));
    }

    @ParameterizedTest
    @NullSource
    @MethodSource("emptyHeaders")
    public void testCreateMcp_emptyHeadersRemoveConfigHeaders(Map<String, String> headers) {
        // 准备参数：平铺请求头为空，config 中仍有旧鉴权
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp").setHeaders(headers)
                .setConfig("{\"headers\":{\"Authorization\":\"Bearer old\"}}");

        // 调用
        Long id = mcpService.createMcp(reqVO);
        // 断言列表回显和运行时配置均不保留旧请求头
        Ai1McpDO mcp = mcpService.getMcp(id);
        assertTrue(mcp.getHeaders().isEmpty());
        assertFalse(JsonUtils.parseMap(mcp.getConfig()).containsKey("headers"));
    }

    @Test
    public void testCreateMcp_configUrlFallback() {
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setConfig("{\"url\":\"http://127.0.0.1:8081/mcp\"}");

        // 调用
        Long id = mcpService.createMcp(reqVO);
        // 断言
        Ai1McpDO mcp = mcpService.getMcp(id);
        assertEquals("http://127.0.0.1:8081/mcp", mcp.getUrl());
        assertEquals(mcp.getUrl(), JsonUtils.parseMap(mcp.getConfig()).get("url"));
    }

    @Test
    public void testCreateMcp_conflictingUrls() {
        // 准备参数
        Ai1McpSaveReqVO reqVO = buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp")
                .setConfig("{\"url\":\"http://127.0.0.1:8082/mcp\"}");

        // 调用
        Long id = mcpService.createMcp(reqVO);
        // 断言平铺地址覆盖 config 中的旧地址
        Ai1McpDO mcp = mcpService.getMcp(id);
        assertEquals(reqVO.getUrl(), mcp.getUrl());
        assertEquals(reqVO.getUrl(), JsonUtils.parseMap(mcp.getConfig()).get("url"));
    }

    @Test
    public void testDeleteMcp_success() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.STDIO.getTransport())
                .setConfig("{\"command\":\"npx\"}"));

        // 调用
        mcpService.deleteMcp(id);
        // 断言
        assertNull(mcpMapper.selectById(id));
        verify(mcpClientTool).evict(id);
    }

    @Test
    public void testDeleteMcpListByIds_success() {
        // mock 数据
        Long id1 = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp"));
        Long id2 = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.STDIO.getTransport())
                .setConfig("{\"command\":\"npx\"}"));
        Long otherId = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8082/mcp"));
        // 准备参数
        List<Long> ids = List.of(id1, id2);

        // 调用
        mcpService.deleteMcpListByIds(ids);
        // 断言
        assertNull(mcpMapper.selectById(id1));
        assertNull(mcpMapper.selectById(id2));
        assertNotNull(mcpMapper.selectById(otherId));
        verify(mcpClientTool).evict(id1);
        verify(mcpClientTool).evict(id2);
    }

    @Test
    public void testDeleteMcpListByIds_notExists() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp"));
        // 准备参数
        List<Long> ids = List.of(id, Long.MAX_VALUE);

        // 调用，并断言异常
        assertServiceException(() -> mcpService.deleteMcpListByIds(ids), MCP_NOT_EXISTS);
        // 断言
        assertNotNull(mcpMapper.selectById(id));
        verifyNoInteractions(mcpClientTool);
    }

    // ========== 审计 ==========

    @Test
    public void testTestMcpConnect_successWritesReadableAuditRow() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp"));
        when(mcpClientTool.testConnect(any())).thenReturn(new Ai1McpConnectRespVO()
                .setConnectable(true).setToolCount(2).setElapsedMs(37L).setMessage("连接成功，发现 2 个工具"));
        AuditLogRepository logRepository = installRealAuditService();
        LoginUser loginUser = new LoginUser();
        loginUser.setId(1024L);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null));

        // 调用
        Ai1McpConnectRespVO result = mcpService.testMcpConnect(id);

        // 断言：端点照常作答，链上多出一行可读的审计
        assertTrue(result.getConnectable());
        AuditLog row = captureSavedRow(logRepository);
        assertEquals("mcp_connect_test", row.getAction());
        assertEquals("1024", row.getUserId());
        assertFalse(row.isError());
        assertNull(row.getOutcome());
        assertNull(row.getTool());
        assertTrue(row.getDetail().contains("id=" + id));
        assertTrue(row.getDetail().contains("name=天气查询"));
        assertTrue(row.getDetail().contains("transport=http"));
        assertTrue(row.getDetail().contains("target=127.0.0.1:8081"));
        assertTrue(row.getDetail().contains("result=ok"));
        assertTrue(row.getDetail().contains("elapsedMs=37"));
        assertTrue(row.getDetail().contains("error=none"));
        assertNotNull(row.getHash());
    }

    @Test
    public void testTestMcpConnect_failureWritesErrorAuditRow() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp"));
        when(mcpClientTool.testConnect(any())).thenReturn(new Ai1McpConnectRespVO()
                .setConnectable(false).setToolCount(0).setTools(new ArrayList<>())
                .setElapsedMs(88L).setMessage("Connection refused"));
        AuditLogRepository logRepository = installRealAuditService();

        // 调用：没有登录用户，调用人落成与运行时一致的「没有身份」哨兵
        mcpService.testMcpConnect(id);

        // 断言
        AuditLog row = captureSavedRow(logRepository);
        assertEquals("mcp_connect_test", row.getAction());
        assertEquals("0", row.getUserId());
        assertTrue(row.isError());
        assertNull(row.getOutcome());
        assertTrue(row.getDetail().contains("result=failed"));
        assertTrue(row.getDetail().contains("error=connect"));
        assertTrue(row.getDetail().contains("message=Connection refused"));
    }

    @Test
    public void testTestMcpConnect_toolThrowsStillWritesAuditRow() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp"));
        when(mcpClientTool.testConnect(any())).thenThrow(new IllegalStateException("dial failed"));
        AuditLogRepository logRepository = installRealAuditService();

        // 调用：异常照旧抛出，但行已经写下
        assertThrows(IllegalStateException.class, () -> mcpService.testMcpConnect(id));

        // 断言
        AuditLog row = captureSavedRow(logRepository);
        assertTrue(row.isError());
        assertTrue(row.getDetail().contains("result=failed"));
        assertTrue(row.getDetail().contains("error=other"));
        assertTrue(row.getDetail().contains("message=dial failed"));
    }

    @Test
    public void testTestMcpConnect_auditFailureDoesNotChangeAnswer() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.HTTP.getTransport())
                .setUrl("http://127.0.0.1:8081/mcp"));
        when(mcpClientTool.testConnect(any())).thenReturn(new Ai1McpConnectRespVO()
                .setConnectable(true).setToolCount(1).setElapsedMs(12L).setMessage("连接成功，发现 1 个工具"));
        AuditLogRepository logRepository = installRealAuditService();
        when(logRepository.save(any(AuditLog.class))).thenThrow(new IllegalStateException("audit unavailable"));

        // 调用：审计坏了，也不能把一次成功的测试变成失败
        Ai1McpConnectRespVO result = assertDoesNotThrow(() -> mcpService.testMcpConnect(id));

        // 断言
        assertTrue(result.getConnectable());
    }

    @Test
    public void testTestMcpConnect_stdioTargetIsCommand() {
        // mock 数据
        Long id = mcpService.createMcp(buildMcpSaveReqVO(Ai1McpTransportEnum.STDIO.getTransport())
                .setConfig("{\"command\":\"npx\",\"args\":[\"-y\",\"server\"]}"));
        when(mcpClientTool.testConnect(any())).thenReturn(new Ai1McpConnectRespVO()
                .setConnectable(false).setToolCount(0).setTools(new ArrayList<>())
                .setElapsedMs(5L).setMessage("配置不完整（缺少必要参数）"));
        AuditLogRepository logRepository = installRealAuditService();

        // 调用
        mcpService.testMcpConnect(id);

        // 断言：本地传输记命令、错误类别是配置
        AuditLog row = captureSavedRow(logRepository);
        assertTrue(row.getDetail().contains("transport=stdio"));
        assertTrue(row.getDetail().contains("target=stdio:npx"));
        assertTrue(row.getDetail().contains("error=config"));
    }

    /**
     * Swaps in the host's real {@link AuditService}, backed by mocked repositories, so the assertions
     * read the row the chain would actually store — hash included — rather than a mocked argument.
     *
     * 换进宿主**真的** {@link AuditService}，仓储用 mock 顶着，于是断言读到的是链真正会存下的那一行
     * —— 连哈希一起 —— 而不是 mock 收到的实参。
     */
    private AuditLogRepository installRealAuditService() {
        AuditLogRepository logRepository = mock(AuditLogRepository.class);
        when(logRepository.findTopByOrderByIdDesc()).thenReturn(Optional.empty());
        when(logRepository.save(any(AuditLog.class))).thenAnswer(invocation -> invocation.getArgument(0));
        AuditChainHeadRepository heads = mock(AuditChainHeadRepository.class);
        when(heads.lockById(AuditChainHead.SINGLETON))
                .thenReturn(Optional.of(new AuditChainHead(AuditChainHead.SINGLETON)));
        GovernancePolicyStore policy = mock(GovernancePolicyStore.class);
        when(policy.granularity()).thenReturn("write");
        ReflectionTestUtils.setField(mcpService, "auditService",
                new AuditService(logRepository, heads, policy, "test-chain-key"));
        return logRepository;
    }

    private static AuditLog captureSavedRow(AuditLogRepository logRepository) {
        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(logRepository).save(captor.capture());
        return captor.getValue();
    }

    // ========== 测试数据 ==========

    private static Stream<Map<String, String>> emptyHeaders() {
        return Stream.of(Collections.emptyMap());
    }

    private static Ai1McpSaveReqVO buildMcpSaveReqVO(String transport) {
        return new Ai1McpSaveReqVO().setName("天气查询").setTransport(transport).setStatus(CommonStatusEnum.ENABLE.getStatus());
    }

}

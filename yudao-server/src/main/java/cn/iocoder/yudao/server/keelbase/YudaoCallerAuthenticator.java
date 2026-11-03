// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.AuthenticatedSubject;
import cn.com.keelbase.runtime.security.CallerAuthenticator;
import cn.hutool.core.util.StrUtil;
import cn.iocoder.yudao.framework.common.biz.system.oauth2.OAuth2TokenCommonApi;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.common.biz.system.oauth2.dto.OAuth2AccessTokenCheckRespDTO;
import cn.iocoder.yudao.framework.security.config.SecurityProperties;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * Answers "who is this request" from Yudao's own OAuth2 token store, by doing the check here.
 *
 * <p>The shape is the one the runtime's seam asks for and the one S6 taught: the seam receives the
 * {@code HttpServletRequest}, so the deployment establishes the caller from the request rather than
 * assuming a host filter already did. On Yudao that matters for the same reason it did on RuoYi —
 * Yudao's {@code TokenAuthenticationFilter} runs inside Yudao's own chain, and the runtime's chain is
 * scoped to its own paths, so on every KeelBase path Yudao's filter may never run. Asking Yudao's
 * token API directly works identically on both chains.
 *
 * <p>Authority is not decided here: the subject carries no role, and the runtime's authorization
 * contracts answer what the identity may do downstream.
 *
 * 从芋道自己的 OAuth2 令牌存储回答「这个请求是谁」——**在这里做校验**。
 *
 * <p>形状正是运行时接缝要的、也是 **S6** 教出来的：接缝收到 {@code HttpServletRequest}，所以**部署方从请求
 * 里建立调用方**，而不是假设宿主过滤器已经做过了。在芋道上这件事成立的理由与 RuoYi 相同——芋道的
 * {@code TokenAuthenticationFilter} 住在芋道自己的链里，而运行时的链只认自己的路径，于是在每一条 KeelBase
 * 路径上芋道的过滤器**可能从不运行**。直接问芋道的令牌 API，在两条链上表现一致。
 *
 * <p>此处**不裁决权限**：主体不带角色，这个身份能做什么由运行时的授权契约在下游回答。
 */
@Component
public class YudaoCallerAuthenticator implements CallerAuthenticator {

    private final SecurityProperties securityProperties;
    private final OAuth2TokenCommonApi oauth2TokenApi;

    public YudaoCallerAuthenticator(SecurityProperties securityProperties,
                                    OAuth2TokenCommonApi oauth2TokenApi) {
        this.securityProperties = securityProperties;
        this.oauth2TokenApi = oauth2TokenApi;
    }

    @Override
    public AuthenticatedSubject authenticate(HttpServletRequest request) {
        String token = SecurityFrameworkUtils.obtainAuthorization(request,
                securityProperties.getTokenHeader(), securityProperties.getTokenParameter());
        if (StrUtil.isEmpty(token)) {
            return null;
        }
        try {
            OAuth2AccessTokenCheckRespDTO accessToken = oauth2TokenApi.checkAccessToken(token);
            if (accessToken == null) {
                return null;
            }
            // Only the console's token namespace is a caller here. Yudao signs member and administrator
            // tokens into the same table with the same number sequence, and the identity seam resolves
            // the subject through the administrator directory — so a member token whose id matches an
            // administrator's would be read as that administrator. Refuse the other namespace at the
            // door; the tool face is an administrator face.
            // 这里只认控制台那一套令牌。芋道把会员与管理员令牌签进同一张表、共用同一套编号序列，而身份这条缝又是
            // 拿主体去**管理员**名录里认人——于是一个 id 与某管理员相同的会员令牌，会被读成那个管理员。别的命名
            // 空间在门口就拒掉；工具面本来就是管理员面。
            if (!UserTypeEnum.ADMIN.getValue().equals(accessToken.getUserType())) {
                return null;
            }
            return new AuthenticatedSubject(String.valueOf(accessToken.getUserId()), null);
        } catch (RuntimeException invalid) {
            // Yudao throws rather than returning null for a bad token; a request that proves nothing
            // is left unauthenticated and the runtime's chain answers 401.
            // 芋道对坏令牌是抛异常而非返回 null；证明不了任何东西的请求保持未认证，由运行时的链回答 401。
            return null;
        }
    }
}

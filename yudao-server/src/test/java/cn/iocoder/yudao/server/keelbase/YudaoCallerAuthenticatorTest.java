// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.AuthenticatedSubject;
import cn.iocoder.yudao.framework.common.biz.system.oauth2.OAuth2TokenCommonApi;
import cn.iocoder.yudao.framework.common.biz.system.oauth2.dto.OAuth2AccessTokenCheckRespDTO;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.config.SecurityProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Which token namespace may become a caller here.
 *
 * <p>The host signs two kinds of token into one table: the console's and the member module's. Their ids
 * come from two sequences that start at the same number, and the identity seam resolves a subject
 * through the <em>administrator</em> directory — so an id is not enough to tell the two apart. These
 * tests pin the door: an administrator token is a caller, a member token is nobody, and a token the
 * store refuses stays nobody.
 *
 * 哪一套令牌能成为本宿主的调用方。
 *
 * <p>宿主把两种令牌签进同一张表：控制台的和会员模块的。它们的编号来自两套都从同一个数开始的序列，而身份这条缝
 * 是拿主体去**管理员**名录里认人——故光凭一个编号分不开这两者。这几个测试钉住那道门：管理员令牌是调用方，
 * 会员令牌谁都不是，令牌库拒掉的令牌也一直谁都不是。
 */
class YudaoCallerAuthenticatorTest {

    private final OAuth2TokenCommonApi tokens = mock(OAuth2TokenCommonApi.class);
    private final YudaoCallerAuthenticator authenticator =
            new YudaoCallerAuthenticator(new SecurityProperties(), tokens);

    @Test
    void anAdministratorTokenBecomesTheCaller() {
        when(tokens.checkAccessToken("console")).thenReturn(token(7L, UserTypeEnum.ADMIN.getValue()));

        AuthenticatedSubject subject = authenticator.authenticate(bearer("console"));

        assertEquals("7", subject.subject());
    }

    @Test
    void aMemberTokenIsRefusedEvenWhenItsIdMatchesAnAdministrator() {
        when(tokens.checkAccessToken("member")).thenReturn(token(1L, UserTypeEnum.MEMBER.getValue()));

        assertNull(authenticator.authenticate(bearer("member")),
                "a member token must not be read as the administrator with the same id");
    }

    @Test
    void aMissingTokenIsNobody() {
        assertNull(authenticator.authenticate(new MockHttpServletRequest()));
    }

    @Test
    void aTokenTheStoreRefusesIsNobody() {
        when(tokens.checkAccessToken("stale")).thenThrow(new IllegalStateException("访问令牌已过期"));

        assertNull(authenticator.authenticate(bearer("stale")));
    }

    private static MockHttpServletRequest bearer(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    private static OAuth2AccessTokenCheckRespDTO token(Long userId, Integer userType) {
        OAuth2AccessTokenCheckRespDTO dto = new OAuth2AccessTokenCheckRespDTO();
        dto.setUserId(userId);
        dto.setUserType(userType);
        return dto;
    }
}

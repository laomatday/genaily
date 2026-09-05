package app.genaifamily.device;

/** Also runnable with javac/java offline; each check throws on a regression. */
public final class DeviceProtocolChecks {
    private static int checks;
    private static void check(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError(label);
    }
    public static void main(String[] args) {
        checks = 0;
        String ref = "fhrzkosrnxgvyikmvfph";
        String url = "https://" + ref + ".supabase.co/functions/v1/device-agent";
        String key = "sb_publishable_0123456789abcdefghijklmnopqrstuv";
        check(DeviceProtocol.configurationError(url, key, ref) == null, "valid production config");
        check(DeviceProtocol.configurationError(url.replace("https", "http"), key, ref) != null, "reject cleartext");
        check(DeviceProtocol.configurationError(url.replace(ref, "klpiwihyemfptbiyysna"), key, ref) != null, "reject wrong project");
        check(DeviceProtocol.configurationError(url + "?key=leak", key, ref) != null, "reject query");
        check(DeviceProtocol.configurationError(url + "#fragment", key, ref) != null, "reject fragment");
        check(DeviceProtocol.configurationError(url.replace("https://", "https://user:password@"), key, ref) != null, "reject userinfo");
        check(DeviceProtocol.configurationError(url.replace(".co/", ".co:443/"), key, ref) != null, "reject noncanonical port");
        check(DeviceProtocol.configurationError(url.replace("device-agent", "other"), key, ref) != null, "reject wrong path");
        check(DeviceProtocol.configurationError(url, "", ref) != null, "reject missing key");
        check(DeviceProtocol.configurationError(url, "sb_publishable_REPLACE_ME", ref) != null, "reject placeholder");
        check(DeviceProtocol.configurationError(url, "sb_secret_0123456789abcdefghijklmnopqrstuv", ref) != null, "reject privileged key");
        check(DeviceProtocol.configurationError(url, "eyJhbGciOiJIUzI1NiJ9.legacy.jwt", ref) != null, "reject JWT");
        check(DeviceProtocol.configurationError(null, key, ref) != null, "reject missing endpoint");
        check(DeviceProtocol.configurationError(url, key, "wrong") != null, "reject invalid ref");
        check("ABCDEF0123456789".equals(DeviceProtocol.normalizeCode("abcd ef01-2345 6789")), "normalize formatted code");
        check("ABCDEF0123456789".equals(DeviceProtocol.normalizeCode("abcd\u00a0ef01\t2345\n6789\u2007")), "normalize Unicode whitespace");
        check("".equals(DeviceProtocol.normalizeCode(null)), "null input");
        check(DeviceProtocol.validCode("ABCDEF0123456789"), "valid code");
        check(!DeviceProtocol.validCode("ABCDEF012345678"), "short code");
        check(!DeviceProtocol.validCode("ABCDEF01234567890"), "long code");
        check(!DeviceProtocol.validCode("GBCDEF0123456789"), "nonhex code");
        check(DeviceProtocol.httpError(404, DeviceProtocol.INVALID_PAIRING).startsWith("PAIRING_CODE:"), "expired code not endpoint failure");
        check(DeviceProtocol.httpError(404, "not found").startsWith("ENDPOINT:"), "missing endpoint");
        check(!DeviceProtocol.isRevokedResponse(401, "Invalid JWT"), "gateway 401 must preserve device token");
        check(DeviceProtocol.isRevokedResponse(401, DeviceProtocol.DEVICE_UNAUTHORIZED), "explicit device rejection");
        check(DeviceProtocol.httpError(503, "secret=do-not-display").startsWith("SERVER:"), "safe server error");
        check(!DeviceProtocol.httpError(500, "sb_secret_PRIVATE").contains("PRIVATE"), "never reflect secrets");
        System.out.println("PASS: " + checks + " device protocol checks");
    }
}

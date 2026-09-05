package app.genaifamily.device;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureStore {
    private static final String KEY_ALIAS = "genai_family_device_token";
    private static final String STORE_NAME = "secure_device_state";
    private static final String TOKEN_KEY = "encrypted_device_token";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";

    private SecureStore() {}

    static void saveToken(Context context, String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] ciphertext = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        ByteBuffer value = ByteBuffer.allocate(4 + iv.length + ciphertext.length);
        value.putInt(iv.length).put(iv).put(ciphertext);
        if (!preferences(context).edit()
                .putString(TOKEN_KEY, Base64.encodeToString(value.array(), Base64.NO_WRAP))
                .commit()) throw new java.io.IOException("Secure token persistence failed");
    }

    static String readToken(Context context) {
        String encoded = preferences(context).getString(TOKEN_KEY, null);
        if (encoded == null) return null;
        try {
            ByteBuffer value = ByteBuffer.wrap(Base64.decode(encoded, Base64.NO_WRAP));
            int ivLength = value.getInt();
            if (ivLength < 12 || ivLength > 16 || value.remaining() <= ivLength) return null;
            byte[] iv = new byte[ivLength];
            value.get(iv);
            byte[] ciphertext = new byte[value.remaining()];
            value.get(ciphertext);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            clearToken(context);
            return null;
        }
    }

    static void clearToken(Context context) {
        preferences(context).edit().remove(TOKEN_KEY).apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE);
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }
}

package mv.mvmarkets.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Fetches /api/app/feed (new items + announcements since the last check) and shows them as
 * heads-up phone notifications. The first run only records "now", so old items are never shown.
 */
public final class FeedChecker {
    public static final String CHANNEL = "updates";
    private static final String PREFS = "feed";
    private static final String SINCE = "since";

    private FeedChecker() {}

    public static void createChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "New items & updates", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("New items for sale, giveaways and app updates from MV Markets");
        nm.createNotificationChannel(ch);
    }

    public static synchronized void check(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String since = prefs.getString(SINCE, null);
        HttpURLConnection c = null;
        try {
            String q = since == null ? "" : "?since=" + URLEncoder.encode(since, "UTF-8");
            URL url = new URL(BuildConfig.SITE_ORIGIN + "/api/app/feed" + q);
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", "MVMarketsApp/" + BuildConfig.VERSION_NAME + " (Android; background)");
            try {
                String cookie = CookieManager.getInstance().getCookie(BuildConfig.SITE_ORIGIN);
                if (cookie != null) c.setRequestProperty("Cookie", cookie); // so your own new listings are not announced to you
            } catch (Exception ignored) { }
            if (c.getResponseCode() != 200) return;
            JSONObject res = new JSONObject(read(c.getInputStream()));
            String now = res.getString("now");
            if (since != null) show(ctx, res.getJSONArray("items"), res.optInt("newItems", -1));
            prefs.edit().putString(SINCE, now).apply();
        } catch (Exception ignored) {
            // No connection etc. — try again next time.
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static void show(Context ctx, JSONArray items, int totalNewItems) throws Exception {
        if (items.length() == 0) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled()) return;
        createChannel(ctx);

        int newItems = 0;
        for (int i = 0; i < items.length(); i++) if ("NEW_LISTING".equals(items.getJSONObject(i).getString("kind"))) newItems++;
        if (totalNewItems > newItems) newItems = totalNewItems;
        boolean summarise = newItems > 3;

        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.getJSONObject(i);
            if (summarise && "NEW_LISTING".equals(it.getString("kind"))) continue;
            post(ctx, nm, it.getString("id").hashCode(), it.getString("title"), it.getString("body"), it.getString("url"));
        }
        if (summarise) post(ctx, nm, 777, newItems + " new items for sale", "Tap to see the latest listings on MV Markets.", "/search");
    }

    private static void post(Context ctx, NotificationManager nm, int id, String title, String body, String path) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_VIEW);
        open.putExtra(MainActivity.EXTRA_PATH, path);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setColor(0xFF1D5D8D)
                .setAutoCancel(true)
                .setContentIntent(pi);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        nm.notify(id, b.build());
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }
}

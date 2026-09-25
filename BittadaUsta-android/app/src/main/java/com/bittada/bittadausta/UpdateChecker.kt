package com.bittada.bittadausta

import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class UpdateChecker(private val activity: Activity) {

    companion object {
        private const val VERSION_CHECK_URL = "https://usta.bittada.uz/api/app-version/"
        private const val APK_DOWNLOAD_URL = "https://usta.bittada.uz/api/app-download/"
        private const val PREF_NAME = "app_update"
        private const val KEY_LAST_SKIP = "last_skip_version"
        private const val KEY_SKIP_COUNT = "skip_count"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var progressDialog: AlertDialog? = null

    fun checkOnStart() {
        Thread {
            try {
                val url = URL(VERSION_CHECK_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.setRequestProperty("Accept", "application/json")

                if (conn.responseCode == 200) {
                    val response = conn.inputStream.bufferedReader().readText()
                    val json = JSONObject(response)

                    val latestVersionCode = json.optInt("version_code", 0)
                    val latestVersionName = json.optString("version_name", "")
                    val downloadUrl = json.optString("download_url", APK_DOWNLOAD_URL)
                    val forceUpdate = json.optBoolean("force", false)
                    val updateMessage = json.optString("message", "Yangi versiya mavjud")

                    val currentVersionCode = activity.packageManager.getPackageInfo(
                        activity.packageName, 0
                    ).longVersionCode.toInt()

                    if (latestVersionCode > currentVersionCode) {
                        handler.post {
                            showUpdateDialog(updateMessage, latestVersionName, downloadUrl, forceUpdate)
                        }
                    }
                }
            } catch (_: Exception) {
                // Internet yo'q yoki xatolik — jim qolamiz
            }
        }.start()
    }

    private fun showUpdateDialog(
        message: String,
        versionName: String,
        downloadUrl: String,
        force: Boolean
    ) {
        val prefs = activity.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val lastSkip = prefs.getString(KEY_LAST_SKIP, "")
        val skipCount = prefs.getInt(KEY_SKIP_COUNT, 0)

        if (!force && lastSkip == versionName && skipCount >= 3) {
            return
        }

        val builder = AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_NoActionBar)
            .setTitle("Yangilanish mavjud")
            .setMessage("$message\n\nVersiya: $versionName")
            .setCancelable(!force)

        if (!force) {
            builder.setNegativeButton("Keyinroq") { _, _ ->
                prefs.edit().putString(KEY_LAST_SKIP, versionName)
                    .putInt(KEY_SKIP_COUNT, skipCount + 1)
                    .apply()
            }
        }

        builder.setPositiveButton("Yangilash") { _, _ ->
            prefs.edit().remove(KEY_LAST_SKIP).remove(KEY_SKIP_COUNT).apply()
            startDownload(downloadUrl)
        }

        builder.show()
    }

    private fun startDownload(downloadUrl: String) {
        val progressDialog = AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_NoActionBar)
            .setTitle("Yuklanmoqda...")
            .setView(createProgressView())
            .setCancelable(false)
            .show()
        this.progressDialog = progressDialog

        Thread {
            try {
                val url = URL(downloadUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 30000

                val fileSize = conn.contentLength
                val inputStream = conn.inputStream

                val updateDir = File(activity.cacheDir, "updates")
                updateDir.mkdirs()
                val apkFile = File(updateDir, "bittada-usta-update.apk")

                val outputStream = apkFile.outputStream()
                val buffer = ByteArray(8192)
                var totalRead = 0
                var bytesRead: Int

                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    totalRead += bytesRead

                    if (fileSize > 0) {
                        val progress = (totalRead * 100 / fileSize)
                        handler.post {
                            updateProgress(progress)
                        }
                    }
                }

                outputStream.flush()
                outputStream.close()
                inputStream.close()

                handler.post {
                    progressDialog.dismiss()
                    installApk(apkFile)
                }

            } catch (e: Exception) {
                handler.post {
                    progressDialog.dismiss()
                    AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_NoActionBar)
                        .setTitle("Xatolik")
                        .setMessage("Yuklab bo'lmadi. Internetni tekshiring.")
                        .setPositiveButton("OK", null)
                        .show()
                }
            }
        }.start()
    }

    private fun createProgressView(): android.view.View {
        val layout = android.widget.LinearLayout(activity).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(60, 40, 60, 20)
        }

        val textView = TextView(activity).apply {
            text = "Iltimos kuting..."
            setTextColor(android.graphics.Color.parseColor("#9B9AA3"))
            textSize = 14f
            id = android.R.id.text1
        }

        val progressBar = ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
            id = android.R.id.progress
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                progressTintList = android.content.res.ColorStateList.valueOf(
                    android.graphics.Color.parseColor("#DCF262")
                )
                backgroundTintList = android.content.res.ColorStateList.valueOf(
                    android.graphics.Color.parseColor("#29282F")
                )
            }
        }

        layout.addView(textView)
        layout.addView(progressBar)

        return layout
    }

    private fun updateProgress(progress: Int) {
        progressDialog?.findViewById<ProgressBar>(android.R.id.progress)?.progress = progress
        progressDialog?.findViewById<TextView>(android.R.id.text1)?.text = "Yuklanmoqda... %$progress"
    }

    private fun installApk(file: File) {
        if (!file.exists()) return

        val intent = Intent(Intent.ACTION_VIEW)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                file
            )
            intent.setDataAndType(uri, "application/vnd.android.package-archive")
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } else {
            intent.setDataAndType(
                Uri.fromFile(file),
                "application/vnd.android.package-archive"
            )
        }

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
        activity.finish()
    }
}

package com.huaxingyuan.attendance

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var currentCameraUri: Uri? = null
    private var currentCameraFile: File? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val data = result.data
            var results: Array<Uri>? = null

            // 1. Check if album/gallery returned a direct content Uri
            if (data?.data != null) {
                results = arrayOf(data.data!!)
            } else if (data?.clipData != null) {
                val clipData = data.clipData!!
                val list = mutableListOf<Uri>()
                for (i in 0 until clipData.itemCount) {
                    list.add(clipData.getItemAt(i).uri)
                }
                results = list.toTypedArray()
            } else if (currentCameraFile != null && currentCameraFile!!.exists() && currentCameraFile!!.length() > 0) {
                // 2. Camera photo captured into FileProvider Uri
                currentCameraUri?.let { uri ->
                    results = arrayOf(uri)
                }
            } else if (data?.extras?.get("data") is Bitmap) {
                // 3. Fallback: Camera intent returned bitmap in intent extras
                val bitmap = data.extras?.get("data") as Bitmap
                try {
                    val tempFile = File.createTempFile("cam_thumb_", ".jpg", cacheDir)
                    FileOutputStream(tempFile).use { out ->
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)
                    }
                    val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", tempFile)
                    results = arrayOf(uri)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            } else {
                // 4. Default FileChooserParams fallback
                results = WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
            }

            fileUploadCallback?.onReceiveValue(results)
        } else {
            fileUploadCallback?.onReceiveValue(null)
        }
        fileUploadCallback = null
        currentCameraUri = null
        currentCameraFile = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        // Enable hardware accelerated modern WebView
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                mWebView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback

                val isCapture = fileChooserParams?.isCaptureEnabled ?: false

                if (isCapture) {
                    // 现场拍照：直接调起系统相机
                    try {
                        val photoFile = File.createTempFile("photo_", ".jpg", cacheDir)
                        currentCameraFile = photoFile
                        val photoUri = FileProvider.getUriForFile(this@MainActivity, "${packageName}.fileprovider", photoFile)
                        currentCameraUri = photoUri

                        val takePictureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                            putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                        }
                        fileChooserLauncher.launch(takePictureIntent)
                        return true
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                // 本地相册或通用选择器
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "image/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }

                try {
                    val chooser = Intent.createChooser(intent, "选择员工照片")
                    fileChooserLauncher.launch(chooser)
                } catch (e: Exception) {
                    fileUploadCallback = null
                    return false
                }
                return true
            }
        }

        // Back button support
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        // Load local interactive assets
        webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}

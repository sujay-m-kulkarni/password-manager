package com.vaultapp.cardscan

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.common.sdkinternal.MlKitContext
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Scans a payment card with the camera and reads its text on the phone (ML Kit, bundled model:
 * no download, no network). Frames are analysed in memory only; no photo is taken or saved, and
 * the window is screenshot-blocked like the rest of Vault.
 *
 * Either side of a card can be scanned (many cards print the number, expiry and name on the
 * back). It takes its time and closes itself when done (1.8.3): once the same Luhn-valid number
 * has been read in two frames, or (a side without the number) once an expiry has been read, it
 * keeps reading until no new text has turned up for a while, so the bank's name and the rest of
 * the card are read too. Done still closes it at any time. Returns the number, if one was read,
 * and the text lines seen; the app picks out expiry, name and bank in TypeScript and never keeps
 * a CVV.
 */
class CardScanActivity : ComponentActivity() {
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  // Created in onCreate, not here: ML Kit needs its context set up first (1.8.0 crashed on this).
  private var recognizer: TextRecognizer? = null
  private val seen = HashMap<String, Int>()
  private val lines = LinkedHashSet<String>()
  private lateinit var preview: PreviewView
  private lateinit var hint: TextView
  @Volatile private var done = false
  @Volatile private var confirmed: String? = null
  /** When reading started to wind down (number confirmed or expiry seen), and when text last grew. */
  private var settlingSince = 0L
  private var lastNewText = 0L
  /** A long digit run that wasn't a valid number yet: the number is on this side, keep trying. */
  private var numberLikely = false

  private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (granted) startCamera() else finishWith(null, ERROR_PERMISSION)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

    // Never let the scanner close the app: if text recognition can't start, say so and go back.
    try {
      MlKitContext.initializeIfNeeded(applicationContext)
      recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    } catch (e: Throwable) {
      finishWith(null, ERROR_UNAVAILABLE)
      return
    }

    val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    preview = PreviewView(this).apply { scaleType = PreviewView.ScaleType.FILL_CENTER }
    root.addView(preview, FrameLayout.LayoutParams(-1, -1))
    root.addView(CardFrame(this), FrameLayout.LayoutParams(-1, -1))

    hint = TextView(this).apply {
      text = intent.getStringExtra(EXTRA_PROMPT) ?: "Hold the card inside the frame, in good light"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(56), dp(24), 0)
    }
    root.addView(hint, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    buttons.addView(Button(this).apply {
      text = "Cancel"
      setOnClickListener { finishWith(null, null) }
    })
    // Close now with what has been read (the scanner also closes itself when it's done).
    buttons.addView(Button(this).apply {
      text = "Done"
      setOnClickListener { finishDone() }
    }, LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(16) })
    root.addView(
      buttons,
      FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(48) },
    )
    setContentView(root)

    // After a while without a reading, suggest the way out.
    Handler(Looper.getMainLooper()).postDelayed({
      if (!done && !isFinishing && settlingSince == 0L) hint.text = "Can't read it? Try more light, hold it flat, or cancel and type the details."
    }, 15000)

    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      startCamera()
    } else {
      askCamera.launch(Manifest.permission.CAMERA)
    }
  }

  private fun startCamera() {
    val future = ProcessCameraProvider.getInstance(this)
    future.addListener({
      try {
        val provider = future.get()
        val previewUseCase = Preview.Builder().build().also { it.setSurfaceProvider(preview.surfaceProvider) }
        val analysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setResolutionSelector(
            ResolutionSelector.Builder()
              .setResolutionStrategy(
                ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER),
              )
              .build(),
          )
          .build()
        analysis.setAnalyzer(executor) { image -> analyze(image) }
        provider.unbindAll()
        provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, previewUseCase, analysis)
      } catch (e: Exception) {
        finishWith(null, ERROR_CAMERA)
      }
    }, ContextCompat.getMainExecutor(this))
  }

  @OptIn(ExperimentalGetImage::class)
  private fun analyze(image: ImageProxy) {
    val media = image.image
    if (media == null || done) {
      image.close()
      return
    }
    val rec = recognizer
    if (rec == null) {
      image.close()
      return
    }
    val input = InputImage.fromMediaImage(media, image.imageInfo.rotationDegrees)
    rec.process(input)
      .addOnSuccessListener { text ->
        val frameLines = text.textBlocks.flatMap { b -> b.lines.map { it.text.trim() } }.filter { it.isNotEmpty() }
        val now = SystemClock.elapsedRealtime()
        var grew = false
        for (l in frameLines) {
          if (lines.size >= MAX_LINES) break
          if (lines.add(l)) grew = true
        }
        if (grew) lastNewText = now
        if (frameLines.any { LONG_DIGITS.containsMatchIn(it) }) numberLikely = true

        val number = CardNumber.find(frameLines)
        if (number != null && confirmed == null) {
          val count = (seen[number] ?: 0) + 1
          seen[number] = count
          if (count >= 2) {
            confirmed = number
            startSettling(now, "Got the number. Hold still while the rest of the card is read…")
          }
        }
        // A side without the number: once the expiry is read, wind down the same way.
        if (confirmed == null && settlingSince == 0L && !numberLikely && frameLines.any { EXPIRY.containsMatchIn(it) }) {
          startSettling(now, "Reading the rest of this side… hold still")
        }
        if (settlingSince > 0L) {
          val settled = now - settlingSince >= MIN_SETTLE_MS && now - lastNewText >= QUIET_MS
          if (settled || now - settlingSince >= MAX_SETTLE_MS) {
            val n = confirmed
            if (n != null) finishWith(n, null) else if (!numberLikely) finishWith(null, null, ok = true)
          }
        }
      }
      .addOnCompleteListener { image.close() }
  }

  private fun startSettling(now: Long, message: String) {
    settlingSince = now
    lastNewText = now
    hint.text = message
  }

  /** Done: the number read most often (if any) and every line seen. */
  private fun finishDone() {
    if (done) return
    val best = confirmed ?: seen.maxByOrNull { it.value }?.key
    finishWith(best, null, ok = true)
  }

  private fun finishWith(number: String?, error: String?, ok: Boolean = number != null) {
    if (done) return
    done = true
    runOnUiThread {
      val data = Intent()
      if (ok) {
        if (number != null) data.putExtra(EXTRA_NUMBER, number)
        data.putStringArrayListExtra(EXTRA_LINES, ArrayList(lines))
        setResult(Activity.RESULT_OK, data)
      } else {
        if (error != null) data.putExtra(EXTRA_ERROR, error)
        setResult(Activity.RESULT_CANCELED, data)
      }
      finish()
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    executor.shutdown()
    recognizer?.close()
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  /** Dims the screen outside a card-shaped (85.6 × 54 mm) frame. */
  private class CardFrame(context: Context) : View(context) {
    private val dim = Paint().apply { color = Color.argb(150, 0, 0, 0) }
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.parseColor("#A99CF0")
      style = Paint.Style.STROKE
      strokeWidth = 6f
    }

    override fun onDraw(canvas: Canvas) {
      val w = width * 0.88f
      val h = w / 1.586f
      val left = (width - w) / 2f
      val top = (height - h) / 2f
      val rect = RectF(left, top, left + w, top + h)
      val radius = w * 0.05f
      val hole = Path().apply {
        fillType = Path.FillType.EVEN_ODD
        addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
        addRoundRect(rect, radius, radius, Path.Direction.CW)
      }
      canvas.drawPath(hole, dim)
      canvas.drawRoundRect(rect, radius, radius, border)
    }
  }

  companion object {
    const val EXTRA_NUMBER = "number"
    const val EXTRA_LINES = "lines"
    const val EXTRA_ERROR = "error"
    const val EXTRA_PROMPT = "prompt"
    const val ERROR_PERMISSION = "permission"
    const val ERROR_CAMERA = "camera"
    const val ERROR_UNAVAILABLE = "unavailable"
    private const val MAX_LINES = 400
    /** Wind-down: at least this long, until no new text for QUIET_MS, and never longer than MAX. */
    private const val MIN_SETTLE_MS = 2000L
    private const val QUIET_MS = 1500L
    private const val MAX_SETTLE_MS = 6000L
    private val LONG_DIGITS = Regex("\\d(?:[\\d ]*\\d){11,}")
    private val EXPIRY = Regex("\\b(0[1-9]|1[0-2])\\s?[/-]\\s?(\\d{2}|\\d{4})\\b")
  }
}

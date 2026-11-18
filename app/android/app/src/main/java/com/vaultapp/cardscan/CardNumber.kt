package com.vaultapp.cardscan

/** Card-number recognition for the scanner: plain Kotlin, no Android, so it can be tested anywhere. */
object CardNumber {
  /** A 13–19 digit run that passes the Luhn check, from one line or two neighbouring lines. */
  fun find(lines: List<String>): String? {
    val digitRuns = lines.map { line -> line.replace(Regex("[\\s-]"), "") }
    for (i in digitRuns.indices) {
      val single = Regex("\\d{13,19}").find(digitRuns[i])?.value
      if (single != null && luhn(single)) return single
      if (i + 1 < digitRuns.size) {
        val joined = digitRuns[i] + digitRuns[i + 1]
        if (Regex("^\\d{13,19}$").matches(joined) && luhn(joined)) return joined
      }
    }
    return null
  }

  fun luhn(n: String): Boolean {
    var sum = 0
    for (i in n.indices) {
      var d = n[n.length - 1 - i] - '0'
      if (i % 2 == 1) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
    }
    return sum % 10 == 0
  }
}

import static net.grinder.script.Grinder.grinder

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import java.nio.charset.StandardCharsets
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardCopyOption
import net.grinder.plugin.http.HTTPPluginControl
import net.grinder.plugin.http.HTTPRequest
import net.grinder.script.GTest
import net.grinder.scriptengine.groovy.junit.GrinderRunner
import net.grinder.scriptengine.groovy.junit.annotation.AfterThread
import net.grinder.scriptengine.groovy.junit.annotation.BeforeProcess
import net.grinder.scriptengine.groovy.junit.annotation.BeforeThread
import org.junit.Test
import org.junit.runner.RunWith
import HTTPClient.HTTPResponse
import HTTPClient.NVPair

@RunWith(GrinderRunner)
class HybridInterviewTest {
  // nGrinder는 브라우저 렌더링 대신 운영 public API의 세션 생명주기만 반복한다.
  // 브라우저 5명은 별도 Playwright 프로세스가 담당하므로 ordinal 중복을 금지한다.
  private static final String BASE_URL = "https://init-jungle.cloud"
  private static final String INPUT_PATH = "/var/lib/ngrinder/hybrid-input/current.csv"
  private static final String RESULT_DIRECTORY = "/var/lib/ngrinder/hybrid-results/current/vu-results"
  private static final String START_EPOCH_PATH = "/var/lib/ngrinder/hybrid-results/current/start-at-epoch"
  private static final boolean VALIDATION_ONLY = false
  private static final Set<Integer> BROWSER_ORDINALS = [1, 21, 61, 81, 131] as Set<Integer>
  private static final List<String> ROUTE_KEYS = Collections.unmodifiableList([
    "APPLICATION_STATUS",
    "INTERVIEW_START",
    "INTERVIEW_RUNTIME",
    "INTERVIEW_QUESTIONS",
    "DEVICE_CHECK",
    "INTERVIEW_BEGIN",
  ])

  private static GTest holdTest
  private static List<Map<String, String>> inputRows
  private static long startEpochSeconds

  private static HTTPRequest request
  private String applicationId
  private String magicToken
  private String publicAccessToken
  private String sessionId
  private long holdStartedAtNanos
  private long startedAtEpochMs
  private int runtimeSamples = 0
  private int apiCalls = 0
  private int unexpected4xx = 0
  private int server5xx = 0
  private int timeouts = 0
  private int connectionErrors = 0
  private String status = "FAILED"
  private String failureCode = "INITIALIZATION_FAILED"
  private final Map<String, List<Long>> routeLatencyMs = ROUTE_KEYS.collectEntries { [(it): []] }
  private final Map<String, Integer> routeFailures = ROUTE_KEYS.collectEntries { [(it): 0] }

  @BeforeProcess
  static void beforeProcess() {
    // nGrinder 3.5.9-p1의 PropertyBuilder가 worker JVM에 SNI=false를 강제하므로
    // classic HTTP plugin이 초기화되기 전에 운영 ALB에 필요한 SNI를 복구한다.
    System.setProperty("jsse.enableSNIExtension", "true")
    HTTPPluginControl.getConnectionDefaults().timeout = 15_000
    request = new HTTPRequest()
    holdTest = new GTest(1, "public-interview-hold-sample")
    inputRows = loadInputRows()
    if (!VALIDATION_ONLY) startEpochSeconds = loadStartEpochSeconds()
    Files.createDirectories(Paths.get(RESULT_DIRECTORY))
  }

  @BeforeThread
  void beforeThread() {
    if (VALIDATION_ONLY) {
      return
    }
    // thread number와 CSV 행을 1:1로 고정해 각 VU가 자기 매직링크만 사용하게 한다.
    grinder.statistics.delayReports = true
    try {
      int threadIndex = grinder.threadNumber as int
      if (threadIndex < 0 || threadIndex >= inputRows.size()) {
        throw new SafeFailure("INPUT_THREAD_MISMATCH")
      }
      Map<String, String> row = inputRows[threadIndex]
      applicationId = row.applicationId
      magicToken = row.magicToken
      waitForStartBarrier()
      startedAtEpochMs = System.currentTimeMillis()
      initializeInterview()
      // 긴 시작 장벽 대기 전에 DCR 계측을 등록하면 재실행 시 기록이 유실될 수 있다.
      // 실제 hold 호출 직전에 등록해 nGrinder가 5개 표본을 확실히 집계하도록 한다.
      holdTest.record(this, "holdSample")
      holdStartedAtNanos = System.nanoTime()
      failureCode = "NONE"
    } catch (Throwable ignored) {
      failureCode = safeFailureCode(ignored, "INITIALIZATION_FAILED")
      writeResult()
      throw new AssertionError(failureCode)
    }
  }

  @Test
  void holdSample() {
    if (VALIDATION_ONLY) {
      return
    }
    try {
      // 동시 세션을 충분히 유지하되 실제 heldMs는 관찰 지표로만 기록한다.
      getRuntime()
      runtimeSamples++
      grinder.sleep(32_000L)
    } catch (Throwable ignored) {
      failureCode = safeFailureCode(ignored, "HOLD_SAMPLE_FAILED")
      writeResult()
      throw new AssertionError(failureCode)
    }
  }

  @AfterThread
  void afterThread() {
    if (VALIDATION_ONLY) {
      return
    }
    if (failureCode != "NONE") {
      writeResult()
      return
    }
    try {
      getRuntime()
      getQuestions()
      if (runtimeSamples != 5) {
        throw new SafeFailure("RUNTIME_SAMPLES_INCOMPLETE")
      }
      status = "PASSED"
      // 결과 JSON에는 집계 가능한 counter와 고정 failure code만 쓰며 token/ID는 쓰지 않는다.
      writeResult()
    } catch (Throwable ignored) {
      failureCode = safeFailureCode(ignored, "FINAL_CHECK_FAILED")
      writeResult()
      throw new AssertionError(failureCode)
    }
  }

  private void initializeInterview() {
    Map statusBody = jsonObject(sendGet(
      "APPLICATION_STATUS",
      "/api/v1/public/applications/status",
      [token: magicToken],
      [:],
    ))
    requireSameId(statusBody.applicationId, applicationId, "APPLICATION_STATUS_MISMATCH")

    Map startBody = jsonObject(sendPost(
      "INTERVIEW_START",
      "/api/v1/public/applications/${applicationId}/interview/start",
      JsonOutput.toJson([magicToken: magicToken]),
      ["Content-Type": "application/json"],
    ))
    requireSameId(startBody.applicationId, applicationId, "APPLICATION_START_MISMATCH")
    sessionId = requirePositiveId(startBody.sessionId, "SESSION_ID_INVALID")
    publicAccessToken = requireToken(startBody.publicAccessToken, "ACCESS_TOKEN_INVALID")

    Map runtime = getRuntime()
    requireSameId(runtime.sessionId, sessionId, "RUNTIME_SESSION_MISMATCH")
    getQuestions()

    if (String.valueOf(startBody.interviewSessionStatus) != "IN_PROGRESS") {
      sendPost(
        "DEVICE_CHECK",
        "/api/v1/public/interviews/${sessionId}/device-check",
        JsonOutput.toJson([cameraGranted: true, microphoneGranted: true, networkStable: true]),
        authorizedJsonHeaders(),
      )
      sendPost(
        "INTERVIEW_BEGIN",
        "/api/v1/public/applications/${applicationId}/interview/begin",
        "{}",
        authorizedJsonHeaders(),
      )
      Map activeRuntime = getRuntime()
      requireSameId(activeRuntime.sessionId, sessionId, "ACTIVE_RUNTIME_MISMATCH")
      getQuestions()
    }
  }

  private Map getRuntime() {
    return jsonObject(sendGet(
      "INTERVIEW_RUNTIME",
      "/api/v1/public/applications/${applicationId}/interview",
      [:],
      authorizationHeaders(),
    ))
  }

  private Map getQuestions() {
    return jsonObject(sendGet(
      "INTERVIEW_QUESTIONS",
      "/api/v1/public/interviews/${sessionId}/questions",
      [:],
      authorizationHeaders(),
    ))
  }

  private HTTPResponse sendGet(String routeKey, String path, Map<String, String> params, Map<String, String> headers) {
    NVPair[] query = params.collect { String key, String value -> new NVPair(key, value) } as NVPair[]
    NVPair[] requestHeaders = toHeaders(headers)
    return classifyRequest(routeKey, { request.GET(BASE_URL + path, query, requestHeaders) })
  }

  private HTTPResponse sendPost(String routeKey, String path, String body, Map<String, String> headers) {
    NVPair[] requestHeaders = toHeaders(headers)
    return classifyRequest(routeKey, { request.POST(BASE_URL + path, body.getBytes(StandardCharsets.UTF_8), requestHeaders) })
  }

  private static NVPair[] toHeaders(Map<String, String> headers) {
    return headers.collect { String key, String value -> new NVPair(key, value) } as NVPair[]
  }

  private HTTPResponse classifyRequest(String routeKey, Closure<HTTPResponse> action) {
    if (!ROUTE_KEYS.contains(routeKey)) throw new SafeFailure("ROUTE_KEY_INVALID")
    apiCalls++
    long startedAt = System.nanoTime()
    try {
      HTTPResponse response = action.call()
      int statusCode = response.statusCode
      if (statusCode >= 400 && statusCode < 500) {
        unexpected4xx++
        throw new SafeFailure("HTTP_4XX")
      }
      if (statusCode >= 500) {
        server5xx++
        throw new SafeFailure("HTTP_5XX")
      }
      if (statusCode < 200 || statusCode >= 300) {
        throw new SafeFailure("HTTP_STATUS_UNEXPECTED")
      }
      return response
    } catch (Throwable error) {
      routeFailures[routeKey] = routeFailures[routeKey] + 1
      if (error instanceof SafeFailure) throw error
      if (hasTimeoutType(error)) {
        timeouts++
        throw new SafeFailure("HTTP_TIMEOUT")
      }
      connectionErrors++
      throw new SafeFailure("HTTP_CONNECTION_ERROR")
    } finally {
      long elapsedMs = Math.max(0L, Math.floorDiv(System.nanoTime() - startedAt, 1_000_000L))
      routeLatencyMs[routeKey].add(elapsedMs)
    }
  }

  private Map<String, String> authorizationHeaders() {
    return [Authorization: "Bearer ${publicAccessToken}"]
  }

  private Map<String, String> authorizedJsonHeaders() {
    return [
      Authorization: "Bearer ${publicAccessToken}",
      "Content-Type": "application/json",
    ]
  }

  private static Map jsonObject(HTTPResponse response) {
    try {
      Object parsed = new JsonSlurper().parseText(response.text)
      if (!(parsed instanceof Map)) throw new SafeFailure("INVALID_RESPONSE")
      Object unwrapped = ((Map) parsed).containsKey("data") ? ((Map) parsed).data : parsed
      if (!(unwrapped instanceof Map)) throw new SafeFailure("INVALID_RESPONSE")
      return (Map) unwrapped
    } catch (SafeFailure safeFailure) {
      throw safeFailure
    } catch (Throwable ignored) {
      throw new SafeFailure("INVALID_RESPONSE")
    }
  }

  private static void requireSameId(Object actual, String expected, String code) {
    if (String.valueOf(actual) != expected) throw new SafeFailure(code)
  }

  private static String requirePositiveId(Object value, String code) {
    String id = String.valueOf(value)
    if (!(id ==~ /^[1-9][0-9]*$/)) throw new SafeFailure(code)
    return id
  }

  private static String requireToken(Object value, String code) {
    String token = value instanceof String ? (String) value : ""
    if (!(token ==~ /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)) {
      throw new SafeFailure(code)
    }
    return token
  }

  private static boolean hasTimeoutType(Throwable error) {
    Throwable current = error
    while (current != null) {
      if (current.class.simpleName.toLowerCase(Locale.ROOT).contains("timeout")) return true
      current = current.cause
    }
    return false
  }

  private static String safeFailureCode(Throwable error, String fallback) {
    return error instanceof SafeFailure ? ((SafeFailure) error).code : fallback
  }

  private long elapsedHoldMilliseconds() {
    if (holdStartedAtNanos <= 0L) return 0L
    return (System.nanoTime() - holdStartedAtNanos) / 1_000_000L
  }

  private static void waitForStartBarrier() {
    while (true) {
      long delayMs = startEpochSeconds * 1_000L - System.currentTimeMillis()
      if (delayMs < -30_000L) throw new SafeFailure("START_BARRIER_MISSED")
      if (delayMs <= 0L) return
      grinder.sleep(Math.min(delayMs, 1_000L))
    }
  }

  private static long loadStartEpochSeconds() {
    try {
      String value = new String(Files.readAllBytes(Paths.get(START_EPOCH_PATH)), StandardCharsets.UTF_8).trim()
      if (!(value ==~ /^[1-9][0-9]{9}$/)) throw new SafeFailure("START_BARRIER_INVALID")
      return Long.parseLong(value)
    } catch (SafeFailure safeFailure) {
      throw safeFailure
    } catch (Throwable ignored) {
      throw new SafeFailure("START_BARRIER_INVALID")
    }
  }

  private void writeResult() {
    int threadNumber = (grinder.threadNumber as int) + 1
    String fileName = String.format(Locale.ROOT, "vu-%03d.json", threadNumber)
    Path target = Paths.get(RESULT_DIRECTORY, fileName)
    Path temporary = Paths.get(RESULT_DIRECTORY, fileName + ".tmp")
    Map<String, Object> safeResult = [
      status: status,
      failureCode: failureCode,
      startedAtEpochMs: startedAtEpochMs,
      heldMs: elapsedHoldMilliseconds(),
      runtimeSamples: runtimeSamples,
      apiCalls: apiCalls,
      unexpected4xx: unexpected4xx,
      server5xx: server5xx,
      timeouts: timeouts,
      connectionErrors: connectionErrors,
      routeLatencyMs: routeLatencyMs,
      routeFailures: routeFailures,
    ]
    Files.write(temporary, JsonOutput.toJson(safeResult).getBytes(StandardCharsets.UTF_8))
    try {
      Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    } catch (AtomicMoveNotSupportedException ignored) {
      Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING)
    }
  }

  private static List<Map<String, String>> loadInputRows() {
    try {
      List<String> lines = Files.readAllLines(Paths.get(INPUT_PATH), StandardCharsets.UTF_8)
      if (lines.size() < 2 || lines[0] != "ordinal,applicationId,magicToken") {
        throw new SafeFailure("INPUT_INVALID")
      }
      List<Map<String, String>> rows = []
      Set<String> ordinals = [] as Set<String>
      Set<String> applicationIds = [] as Set<String>
      Set<String> tokens = [] as Set<String>
      lines.drop(1).each { String line ->
        String[] columns = line.split(",", -1)
        if (columns.length != 3) throw new SafeFailure("INPUT_INVALID")
        String ordinal = columns[0]
        String applicationId = columns[1]
        String token = columns[2]
        if (!(ordinal ==~ /^[1-9][0-9]*$/)
          || !(applicationId ==~ /^[1-9][0-9]*$/)
          || !(token ==~ /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
          || BROWSER_ORDINALS.contains(Integer.valueOf(ordinal))
          || !ordinals.add(ordinal)
          || !applicationIds.add(applicationId)
          || !tokens.add(token)) {
          throw new SafeFailure("INPUT_INVALID")
        }
        rows.add([applicationId: applicationId, magicToken: token])
      }
      if (![1, 45, 95, 195].contains(rows.size())) throw new SafeFailure("INPUT_INVALID")
      return Collections.unmodifiableList(rows)
    } catch (SafeFailure safeFailure) {
      throw safeFailure
    } catch (Throwable ignored) {
      throw new SafeFailure("INPUT_INVALID")
    }
  }

  private static class SafeFailure extends RuntimeException {
    final String code

    SafeFailure(String code) {
      super(code)
      this.code = code
    }
  }
}

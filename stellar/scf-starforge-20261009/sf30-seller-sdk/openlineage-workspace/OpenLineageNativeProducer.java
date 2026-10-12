// MIT. Native OpenLineage models and HTTP transport over original producer files.
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.openlineage.client.OpenLineage;
import io.openlineage.client.OpenLineageClientUtils;
import io.openlineage.client.OpenLineageConfig;
import io.openlineage.client.transports.HttpConfig;
import io.openlineage.client.transports.HttpTransport;
import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.*;
import org.apache.hc.core5.http.io.entity.ByteArrayEntity;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.http.io.entity.HttpEntityWrapper;
import org.apache.hc.core5.util.Timeout;

/** Emit original JSON, arrays or NDJSON through io.openlineage:openlineage-java:1.53.0. */
public final class OpenLineageNativeProducer {
  public static final String SDK_VERSION = "1.53.0";
  private static final ObjectMapper JSON = OpenLineageClientUtils.newObjectMapper();
  private static final Set<String> REQUEST_HEADERS = Set.of(
      "content-type", "content-encoding", "content-length", "transfer-encoding",
      "idempotency-key", "x-openlineage-workspace");
  private static final Set<String> RESPONSE_HEADERS = Set.of(
      "content-type", "content-encoding", "content-length", "retry-after");
  private static final String SCHEMA = "commons.openlineage.java-producer.v1";

  private static Map<String,Object> object(Object... pairs) {
    Map<String,Object> result = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) result.put((String)pairs[i], pairs[i + 1]);
    return result;
  }
  private static String sha(byte[] bytes) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }
  private static String required(JsonNode value, String key) {
    JsonNode item = value.get(key);
    if (item == null || !item.isTextual() || item.textValue().isEmpty())
      throw new IllegalArgumentException("Missing original " + key);
    return item.textValue();
  }
  private static void save(Path path, Object value) throws IOException {
    Path pending = path.resolveSibling(path.getFileName() + ".pending");
    Files.write(pending, JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(value));
    try { Files.move(pending, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
    catch (AtomicMoveNotSupportedException error) { Files.move(pending, path, StandardCopyOption.REPLACE_EXISTING); }
  }
  private static void original(Path path, byte[] bytes) throws IOException {
    try { Files.write(path, bytes, StandardOpenOption.CREATE_NEW); }
    catch (FileAlreadyExistsException error) {
      if (!Arrays.equals(Files.readAllBytes(path), bytes))
        throw new IOException("Retained native source changed: " + path.getFileName());
    }
  }
  private static Map<String,String> headers(Header[] source, Set<String> selected) {
    Map<String,String> result = new LinkedHashMap<>();
    for (Header header : source) {
      String name = header.getName().toLowerCase(Locale.ROOT);
      if (selected.contains(name)) result.put(name, header.getValue());
    }
    return result;
  }
  private static List<JsonNode> events(byte[] bytes) throws IOException {
    List<JsonNode> result = new ArrayList<>();
    try (JsonParser parser = JSON.getFactory().createParser(bytes)) {
      while (parser.nextToken() != null) {
        JsonNode value = JSON.readTree(parser);
        if (value.isArray()) value.forEach(result::add); else result.add(value);
      }
    }
    if (result.isEmpty()) throw new IllegalArgumentException("Original source contains no events");
    for (JsonNode value : result)
      if (!value.isObject()) throw new IllegalArgumentException("Each original event must be an object");
    return result;
  }
  private static Object event(JsonNode value) {
    String text = value.toString();
    if (value.has("run") && value.has("job") && !value.has("dataset"))
      return OpenLineageClientUtils.runEventFromJson(text);
    if (value.has("dataset") && !value.has("run") && !value.has("job"))
      return OpenLineageClientUtils.fromJson(text, new TypeReference<OpenLineage.DatasetEvent>() {});
    if (value.has("job") && !value.has("run") && !value.has("dataset"))
      return OpenLineageClientUtils.fromJson(text, new TypeReference<OpenLineage.JobEvent>() {});
    throw new IllegalArgumentException("Select an original RunEvent, JobEvent or DatasetEvent");
  }
  private static void emit(HttpTransport transport, Object value) {
    if (value instanceof OpenLineage.RunEvent) transport.emit((OpenLineage.RunEvent)value);
    else if (value instanceof OpenLineage.DatasetEvent) transport.emit((OpenLineage.DatasetEvent)value);
    else transport.emit((OpenLineage.JobEvent)value);
  }

  /** Capture the native streaming entity without changing its bytes or chunked transfer behavior. */
  private static final class Attempt {
    final Path directory;
    final String prefix;
    final Map<String,Object> value = new LinkedHashMap<>();
    Path wire, response;
    int status;
    Attempt(Path directory, String prefix) { this.directory = directory; this.prefix = prefix; }
    void request(HttpRequest request) throws IOException {
      value.put("requestHeaders", headers(request.getHeaders(), REQUEST_HEADERS));
      if (!(request instanceof ClassicHttpRequest))
        throw new IOException("Native HTTP transport did not create a classic request");
      ClassicHttpRequest classic = (ClassicHttpRequest)request;
      HttpEntity entity = classic.getEntity();
      if (entity == null) throw new IOException("Native HTTP transport has no event entity");
      Path target = directory.resolve(prefix + ".wire");
      Path pending = directory.resolve(prefix + ".wire.partial");
      classic.setEntity(new HttpEntityWrapper(entity) {
        @Override public void writeTo(OutputStream output) throws IOException {
          try (OutputStream captured = Files.newOutputStream(pending)) {
            OutputStream tee = new OutputStream() {
              @Override public void write(int b) throws IOException { output.write(b); captured.write(b); }
              @Override public void write(byte[] b, int offset, int length) throws IOException {
                output.write(b, offset, length); captured.write(b, offset, length);
              }
              @Override public void flush() throws IOException { output.flush(); captured.flush(); }
            };
            super.writeTo(tee); tee.flush();
          }
          Files.move(pending, target, StandardCopyOption.REPLACE_EXISTING);
          wire = target;
        }
      });
    }
    void response(HttpResponse response) throws IOException {
      status = response.getCode();
      value.put("httpStatus", status);
      value.put("responseHeaders", headers(response.getHeaders(), RESPONSE_HEADERS));
      if (!(response instanceof ClassicHttpResponse))
        throw new IOException("Native HTTP transport did not return a classic response");
      ClassicHttpResponse classic = (ClassicHttpResponse)response;
      HttpEntity entity = classic.getEntity();
      byte[] body = entity == null ? new byte[0] : EntityUtils.toByteArray(entity);
      this.response = directory.resolve(prefix + ".response");
      Files.write(this.response, body);
      // HttpTransport retains its original error handling and consumes these same response bytes.
      classic.setEntity(new ByteArrayEntity(body, ContentType.APPLICATION_OCTET_STREAM));
    }
    Map<String,Object> finish() throws Exception {
      if (wire != null) {
        byte[] bytes = Files.readAllBytes(wire);
        value.put("wire", wire.getFileName().toString());
        value.put("wireBytes", bytes.length); value.put("wireSha256", sha(bytes));
      }
      if (response != null) {
        byte[] bytes = Files.readAllBytes(response);
        value.put("response", response.getFileName().toString());
        value.put("responseBytes", bytes.length); value.put("responseSha256", sha(bytes));
      }
      return value;
    }
  }

  /** Continue a private operation. Every successfully received event retains its native wire and reply. */
  public static Map<String,Object> run(Path manifestPath, Path configPath) throws Exception {
    Path root = manifestPath.toAbsolutePath().normalize().getParent();
    JsonNode manifest = JSON.readTree(Files.readAllBytes(manifestPath));
    if (!"commons.openlineage.java-input.v1".equals(required(manifest, "schema")) ||
        !SDK_VERSION.equals(required(manifest, "sdkVersion")))
      throw new IllegalArgumentException("Choose an original native Java operation manifest");
    String operationId = required(manifest, "operationId"), workspaceId = required(manifest, "workspaceId");
    OpenLineageConfig<?> configuration;
    try (InputStream input = Files.newInputStream(configPath)) {
      configuration = OpenLineageClientUtils.loadOpenLineageConfigYaml(
          input, new TypeReference<OpenLineageConfig>() {});
    }
    if (!(configuration.getTransportConfig() instanceof HttpConfig))
      throw new IllegalArgumentException("Use the original generated Java HTTP producer configuration");
    HttpConfig config = (HttpConfig)configuration.getTransportConfig();
    Map<String,String> originalHeaders = config.getHeaders() == null ? Map.of() : new LinkedHashMap<>(config.getHeaders());
    if (!workspaceId.equals(originalHeaders.get("X-OpenLineage-Workspace")))
      throw new IllegalArgumentException("Producer configuration selects a different original workspace");
    if (originalHeaders.keySet().stream().anyMatch(key -> key.equalsIgnoreCase("Idempotency-Key")))
      throw new IllegalArgumentException("The native operation supplies a distinct stable identity for every event");
    String compression = config.getCompression() == HttpConfig.Compression.GZIP ? "gzip" : "identity";
    if (!compression.equals(required(manifest, "compression")))
      throw new IllegalArgumentException("Keep the original operation compression when continuing");
    Path captures = root.resolve("native");
    Files.createDirectories(captures);
    List<Map<String,Object>> receipts = new ArrayList<>();
    int timeoutMs = config.getTimeoutInMillis() == null ? 30000 : config.getTimeoutInMillis();
    Timeout timeout = Timeout.ofMilliseconds(timeoutMs);
    Attempt[] current = new Attempt[1];
    try (FileChannel lockChannel = FileChannel.open(root.resolve("native-java.lock"),
             StandardOpenOption.CREATE, StandardOpenOption.WRITE);
         FileLock lock = lockChannel.tryLock()) {
      if (lock == null) throw new IOException("The original Java producer operation is already running");
      try (CloseableHttpClient http = HttpClients.custom()
          .setConnectionManager(PoolingHttpClientConnectionManagerBuilder.create()
              .setDefaultConnectionConfig(ConnectionConfig.custom()
                  .setConnectTimeout(timeout).setSocketTimeout(timeout).build()).build())
          .setDefaultRequestConfig(RequestConfig.custom()
              .setConnectionRequestTimeout(timeout).setResponseTimeout(timeout).build())
          .disableAutomaticRetries().disableRedirectHandling()
          .addRequestInterceptorLast((request, entity, context) -> current[0].request(request))
          .addResponseInterceptorLast((response, entity, context) -> current[0].response(response))
          .build()) {
        int index = 0;
        JsonNode inputs = manifest.get("inputs");
        if (inputs == null || !inputs.isArray() || inputs.isEmpty())
          throw new IllegalArgumentException("Select complete original producer input files");
        for (JsonNode input : inputs) {
          String file = required(input, "file");
          if (!Path.of(file).getFileName().toString().equals(file))
            throw new IllegalArgumentException("Input files must remain in their original operation directory");
          byte[] bytes = Files.readAllBytes(root.resolve(file));
          if (!sha(bytes).equals(required(input, "sha256")) || bytes.length != input.path("bytes").asLong(-1))
            throw new IOException("Original producer input changed: " + file);
          int sourceIndex = 0;
          for (JsonNode raw : events(bytes)) {
            Object typed = event(raw);
            byte[] serialized = OpenLineageClientUtils.toJson(typed).getBytes(StandardCharsets.UTF_8);
            String nativeHash = sha(serialized), prefix = String.format(Locale.ROOT, "event-%06d", index);
            String requestId = "native-java-" + sha((operationId + "\n" + index + "\n" + nativeHash).getBytes(StandardCharsets.UTF_8));
            Path nativeFile = captures.resolve(prefix + ".json");
            original(nativeFile, serialized);
            Path receiptPath = captures.resolve(prefix + ".receipt.json");
            Map<String,Object> identity = object("index", index, "input", file,
                "inputSha256", input.get("sha256").textValue(), "sourceEventIndex", sourceIndex,
                "eventClass", typed.getClass().getName(), "serialized", prefix + ".json",
                "serializedBytes", serialized.length, "serializedSha256", nativeHash, "operationId", requestId);
            if (Files.exists(receiptPath)) {
              Map<String,Object> prior = JSON.readValue(Files.readAllBytes(receiptPath), new TypeReference<Map<String,Object>>() {});
              JsonNode saved = JSON.valueToTree(prior);
              if (!requestId.equals(saved.path("operationId").asText()) ||
                  !nativeHash.equals(saved.path("serializedSha256").asText()) ||
                  !workspaceId.equals(saved.path("acknowledgement").path("workspaceId").asText()))
                throw new IOException("Saved native producer receipt belongs to different content");
              Path wire = captures.resolve(saved.path("wire").asText());
              Path reply = captures.resolve(saved.path("response").asText());
              if (!sha(Files.readAllBytes(wire)).equals(saved.path("wireSha256").asText()) ||
                  !sha(Files.readAllBytes(reply)).equals(saved.path("responseSha256").asText()))
                throw new IOException("Retained native producer wire or reply changed");
              receipts.add(prior); index++; sourceIndex++; continue;
            }
            String attemptId = prefix + "-" + UUID.randomUUID();
            Attempt attempt = new Attempt(captures, attemptId); current[0] = attempt;
            Map<String,String> eventHeaders = new LinkedHashMap<>(originalHeaders);
            eventHeaders.put("Idempotency-Key", requestId); config.setHeaders(eventHeaders);
            Map<String,Object> attemptRecord = new LinkedHashMap<>(identity);
            attemptRecord.put("startedAt", Instant.now().toString());
            save(captures.resolve(attemptId + ".attempt.json"), attemptRecord);
            try {
              emit(new HttpTransport(http, config), typed);
              attemptRecord.putAll(attempt.finish());
              if (attempt.status != 200 || attempt.wire == null || attempt.response == null)
                throw new IOException("The original workspace did not acknowledge the native event");
              JsonNode reply = JSON.readTree(Files.readAllBytes(attempt.response));
              if (!workspaceId.equals(reply.path("workspaceId").asText()) ||
                  !requestId.equals(reply.path("operationId").asText()) ||
                  !attempt.value.get("wireSha256").equals(reply.path("source").path("id").asText()))
                throw new IOException("The native event reply does not match its original workspace and wire");
              String acknowledgedHash = compression.equals("gzip")
                  ? reply.path("source").path("decodedSha256").asText()
                  : reply.path("source").path("id").asText();
              if (!nativeHash.equals(acknowledgedHash))
                throw new IOException("The workspace decoded event differs from the native SDK event");
              attemptRecord.put("acknowledgement", JSON.convertValue(reply, Map.class));
              attemptRecord.put("completedAt", Instant.now().toString());
              attemptRecord.put("state", "ACKNOWLEDGED");
              save(captures.resolve(attemptId + ".attempt.json"), attemptRecord);
              save(receiptPath, attemptRecord); receipts.add(attemptRecord);
            } catch (Exception error) {
              attemptRecord.putAll(attempt.finish());
              attemptRecord.put("state", "INTERRUPTED");
              attemptRecord.put("errorClass", error.getClass().getName());
              attemptRecord.put("finishedAt", Instant.now().toString());
              save(captures.resolve(attemptId + ".attempt.json"), attemptRecord);
              throw new IOException("Native Java event " + index +
                  " interrupted; continue this same operation after inspecting its retained response", error);
            }
            index++; sourceIndex++;
          }
        }
      }
    }
    Map<String,Object> result = object("schema", SCHEMA, "sdkVersion", SDK_VERSION,
        "sdkLocation", OpenLineage.class.getProtectionDomain().getCodeSource().getLocation().toString(),
        "javaVersion", System.getProperty("java.version"), "operationId", operationId,
        "workspaceId", workspaceId, "compression", compression, "state", "ACKNOWLEDGED",
        "completedAt", Instant.now().toString(), "events", receipts);
    save(root.resolve("java-producer-result.json"), result);
    return result;
  }

  public static void main(String[] args) {
    try {
      if (args.length != 2) throw new IllegalArgumentException("Use MANIFEST.json PRIVATE_JAVA_CONFIG.yaml");
      System.out.println(JSON.writeValueAsString(run(Path.of(args[0]), Path.of(args[1]))));
    } catch (Exception error) {
      System.err.println("{\"error\":\"Native Java producer operation interrupted; inspect its retained files and continue the same operation\"}");
      System.exit(1);
    }
  }
}


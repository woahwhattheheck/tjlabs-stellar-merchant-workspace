using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text.Json;

// Read PE metadata without executing the plugin or loading a Dataverse assembly.
// Key creation is an explicit separate local command; the key is never a report.
if (args.Length == 2 && args[0] == "--create-key")
{
    string destination = Path.GetFullPath(args[1]);
    using RSA rsa = new RSACryptoServiceProvider(2048);
    if (rsa is not RSACryptoServiceProvider csp) throw new InvalidOperationException("CSP key export unavailable.");
    byte[] key = csp.ExportCspBlob(true);
    using (var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None))
    {
        output.Write(key);
        output.Flush(true);
    }
    CryptographicOperations.ZeroMemory(key);
    Console.WriteLine("{\"schema\":\"tjlabs.pmrs.staff-signing-key/v1\",\"state\":\"CREATED\",\"private_key_in_report\":false}");
    return;
}
if (args.Length != 1) throw new ArgumentException("Pass the original complete plugin DLL.");
string path = Path.GetFullPath(args[0]);
AssemblyName name = AssemblyName.GetAssemblyName(path);
using FileStream stream = new(path, FileMode.Open, FileAccess.Read, FileShare.Read);
using PEReader reader = new(stream, PEStreamOptions.LeaveOpen);
if (!reader.HasMetadata) throw new BadImageFormatException("The selected DLL has no native assembly metadata.");
var header = reader.PEHeaders.CorHeader ?? throw new BadImageFormatException("The native CLR header is absent.");
MetadataReader metadata = reader.GetMetadataReader();
List<string> classes = new();
List<string> references = new();
foreach (TypeDefinitionHandle handle in metadata.TypeDefinitions)
{
    TypeDefinition type = metadata.GetTypeDefinition(handle);
    if ((type.Attributes & TypeAttributes.Public) == 0 || (type.Attributes & TypeAttributes.Abstract) != 0) continue;
    bool plugin = false;
    foreach (InterfaceImplementationHandle ih in type.GetInterfaceImplementations())
    {
        var implementation = metadata.GetInterfaceImplementation(ih).Interface;
        if (implementation.Kind != HandleKind.TypeReference) continue;
        var tr = metadata.GetTypeReference((TypeReferenceHandle)implementation);
        if (metadata.GetString(tr.Namespace) == "Microsoft.Xrm.Sdk" && metadata.GetString(tr.Name) == "IPlugin") plugin = true;
    }
    if (plugin) classes.Add(metadata.GetString(type.Namespace) + "." + metadata.GetString(type.Name));
}
foreach (AssemblyReferenceHandle handle in metadata.AssemblyReferences)
{
    var reference = metadata.GetAssemblyReference(handle);
    references.Add(metadata.GetString(reference.Name));
}
bool signed = (header.Flags & CorFlags.StrongNameSigned) != 0
    && header.StrongNameSignatureDirectory.Size > 0;
byte[] publicToken = name.GetPublicKeyToken() ?? Array.Empty<byte>();
Console.WriteLine(JsonSerializer.Serialize(new
{
    name = name.Name, version = name.Version?.ToString(), culture = name.CultureName ?? "",
    public_key_token = Convert.ToHexString(publicToken).ToLowerInvariant(),
    strong_name_signed = signed,
    plugin_types = classes.OrderBy(x => x, StringComparer.Ordinal).ToArray(),
    references = references.OrderBy(x => x, StringComparer.Ordinal).ToArray(),
    meaning = "Actual PE metadata and compiler signature flag. No plugin code was executed; tenant acceptance is separate."
}));

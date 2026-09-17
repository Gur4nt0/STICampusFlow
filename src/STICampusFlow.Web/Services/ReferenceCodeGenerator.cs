using System.Security.Cryptography;

namespace STICampusFlow.Web.Services;

/// <summary>
/// Produces the short claim-slip code, e.g. <c>CF-7K2M9Q</c>.
/// The alphabet deliberately drops characters that are easy to confuse when a student
/// reads the code out loud at the counter (0/O, 1/I, 5/S, 8/B).
/// </summary>
public static class ReferenceCodeGenerator
{
    private const string Alphabet = "ACDEFGHJKLMNPQRTUVWXY2346789";
    private const string Prefix = "CF-";
    private const int Length = 6;

    public static string Next()
    {
        Span<char> buffer = stackalloc char[Length];
        for (var i = 0; i < Length; i++)
            buffer[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];

        return Prefix + new string(buffer);
    }
}

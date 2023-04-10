Set-Location ((Split-Path $MyInvocation.MyCommand.Path -Parent) + '\..\')

$libraries = @(
    'libffi-8.dll',
    'libglib-2.0-0.dll',
    'libgobject-2.0-0.dll',
    'libiconv-2.dll',
    'libintl-8.dll',
    'libpcre2-8-0.dll'
)

if (($libraries | foreach { Test-Path ([System.IO.Path]::Combine('./node_modules/sharp/build/Release', $_)) }) -contains $false) {
    New-Item -Path temp -ItemType Directory
    
    $urls = @(
        'https://7-zip.org/a/7zr.exe',
        'https://github.com/mcmilk/7-Zip-zstd/releases/download/v22.01-v1.5.5-R2/7z22.01-zstd-x64.exe'
    )

    if ($args[0] -eq 'ia32') {
        $urls += @(
            'https://repo.msys2.org/mingw/clang32/mingw-w64-clang-i686-glib2-2.76.1-1-any.pkg.tar.zst',
            'https://repo.msys2.org/mingw/clang32/mingw-w64-clang-i686-gettext-0.21.1-1-any.pkg.tar.zst',
            'https://repo.msys2.org/mingw/clang32/mingw-w64-clang-i686-libffi-3.4.4-1-any.pkg.tar.zst',
            'https://repo.msys2.org/mingw/clang32/mingw-w64-clang-i686-libiconv-1.17-3-any.pkg.tar.zst',
            'https://repo.msys2.org/mingw/clang32/mingw-w64-clang-i686-pcre2-10.42-1-any.pkg.tar.zst'
        )
    } else {
        $urls += @(
            'https://repo.msys2.org/mingw/clang64/mingw-w64-clang-x86_64-glib2-2.76.1-1-any.pkg.tar.zst',
            'https://repo.msys2.org/mingw/clang64/mingw-w64-clang-x86_64-gettext-0.21.1-1-any.pkg.tar.zst',
            'https://repo.msys2.org/mingw/clang64/mingw-w64-clang-x86_64-libffi-3.4.4-1-any.pkg.tar.zst',
            'https://repo.msys2.org/mingw/clang64/mingw-w64-clang-x86_64-libiconv-1.17-3-any.pkg.tar.zst',
            'https://repo.msys2.org/mingw/clang64/mingw-w64-clang-x86_64-pcre2-10.42-1-any.pkg.tar.zst'
        )
    }

    $urls  | foreach { Invoke-WebRequest $_ -OutFile ('temp\' + (Split-Path $_ -Leaf)) }

    temp\7zr.exe x -otemp temp\7z22.01-zstd-x64.exe

    Get-ChildItem temp\*.zst | foreach { temp\7z.exe e -otemp $_ }

    Get-ChildItem temp\*.tar | foreach { temp\7z.exe e '-onode_modules/sharp/build/Release' $_ $libraries -r -y }

    Remove-Item temp -Recurse
}

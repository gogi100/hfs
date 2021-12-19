# HFS: HTTP File Server

This project is currently at a very early stage, only basic features are available.

HFS is a file server offering a virtual file system (vfs).
You can easily share a single file instead of the whole folder,
or you can rename it, but without touching the real file, just virtually.

# Configuration

At the moment there's no administration UI. You must edit configuration files.

## Virtual File System (VFS)

The virtual file system is a tree of nodes.
By default, it's in the file `vfs.yaml`.
You can decide a different file by passing it as first parameter at command line.
A node is folder, unless you provide for it a source that's not a folder itself.
Valid keys in a node are: 
- `name`: how to display it. If not provided HFS will infer it from the source.  
- `source`: where to get its content from. Absolute or relative file path, or even http url.
- `children`: just for folders, specify its virtual children.
     Value is a list and its entries are nodes.  
- `hidden`: this must not be listed, but it's still downloadable.
- `hide`: similar to hidden, but it's from the parent node point of view.
     Use this to hide entries that are read from the source, not listed in the VFS.
     Value can be just a file name, a mask, or a list of names/masks. 
- `rename`: similar to name, but it's  from the parent node point.
     Use this to change the name of  entries that are read from the source, not listed in the VFS.
     Value is a dictionary, where the key is the original name.   
- `perm`: specify who can see this.
     Use this to limit access to this node.
     Value is a dictionary, where the key is the username, and the value is `r`.    

# Accounts

Accounts are kept in `accounts.yaml` if any, or you can decide another file by passing parameter `--accounts`.
Inside the file, all accounts should go under `accounts:` key, as a dictionary where the key is the username.
E.g.
```
accounts:
    admin:
        password: hello123
    guest:
        password: guest    
```

As soon as possible HFS will encrypt passwords in a non-reversible way.

# Building instructions

1. Launch `npm run build` in the root
2. Launch `npm run build` inside `frontend` folder

You'll find the output in `dist` folder.

Now to run it you should `cd dist` and `node .`
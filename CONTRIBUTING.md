# Biscotti Finance ConnectKit Contributions

> **If you plan on working on a significant feature, please open an issue and ask before you get started.**

Before starting any development work on ConnectKit please take some time to review this document.

## Develop

Before jumping into any code, make sure you have the following installed:

- [Bun](https://bun.sh/docs/installation) v1.3.14

Then simply clone the repository to your computer like following:

```sh
$ git clone git@github.com:biscottilabs/biscotti-connectkit.git
$ cd biscotti-connectkit
```

and install the dependencies and run the bundler:

```sh
$ bun install
$ bun run dev:connectkit # Start the bundler
```

Depending on how you'd like to develop and test ConnectKit there are a couple of different environments you can fire up (you can see them in `package.json`). These environments double as simple code examples of how to get ConnectKit set up.

```sh
# Custom testbench
$ bun run dev:testbench
# In Vite
$ bun run dev:vite
# In Next.js
$ bun run dev:nextjs
```

If the above environments do not fit your needs, feel free to create a new one.

## Submitting a Pull Request

When you're ready, open a [pull request](https://github.com/biscottilabs/biscotti-connectkit/pulls) and we'll gladly jump into reviewing the code.

Please try and be as detailed as possible in both your commit messages and the changes you introduce to help make the process smoother.

## Writing Documentation

We'll help with updating and writing any documentation related to any feature or changes you're working on.

If there are specific callouts, just let us know in your pull request.

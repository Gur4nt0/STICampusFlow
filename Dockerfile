FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY src/STICampusFlow.Web/STICampusFlow.Web.csproj STICampusFlow.Web/
RUN dotnet restore STICampusFlow.Web/STICampusFlow.Web.csproj

COPY src/STICampusFlow.Web/ STICampusFlow.Web/
WORKDIR /src/STICampusFlow.Web
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:10000
EXPOSE 10000

ENTRYPOINT ["dotnet", "STICampusFlow.Web.dll"]

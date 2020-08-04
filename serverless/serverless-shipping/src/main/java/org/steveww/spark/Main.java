package org.steveww.spark;

import com.mchange.v2.c3p0.ComboPooledDataSource;
import spark.Spark;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.apache.http.HttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.DefaultHttpClient;
import org.apache.http.params.BasicHttpParams;
import org.apache.http.params.HttpConnectionParams;
import org.apache.http.params.HttpParams;
import org.apache.commons.codec.Charsets;
import org.apache.commons.dbutils.QueryRunner;
import org.apache.commons.dbutils.handlers.MapListHandler;
import org.apache.commons.dbutils.DbUtils;
import org.apache.commons.codec.binary.Base64;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

import org.apache.http.Header;
import org.apache.http.HttpEntity;
import org.apache.http.HttpHeaders;
import org.apache.http.NameValuePair;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.*;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.message.BasicNameValuePair;
import org.apache.http.util.EntityUtils;
// import Base64.*;
import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;
import org.json.simple.parser.ParseException;

import java.security.cert.CertificateException;  
import java.security.cert.X509Certificate;  
import java.security.SecureRandom;  
import javax.net.ssl.SSLContext;  
import javax.net.ssl.TrustManager;  
import javax.net.ssl.X509TrustManager;  
import org.apache.http.conn.ClientConnectionManager;  
import org.apache.http.conn.scheme.Scheme;  
import org.apache.http.conn.scheme.SchemeRegistry;  
import org.apache.http.conn.ssl.SSLSocketFactory;  

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Types;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;


public class Main {
    // zevin
    private static int port = 8081;

    private static String CART_URL = null;
    private static String JDBC_URL = null;
    private static Logger logger = LoggerFactory.getLogger(Main.class);
    private static ComboPooledDataSource cpds = null;
    private static boolean initFlag = false;

//    synchronized

    public static JsonObject main(JsonObject args) throws Exception{
        if(!initFlag){
            String[] s = {""};
            Main.main(s);
            Spark.awaitInitialization(); // zevin: we have to wait for the initialization to end
            initFlag = true;
        }


        JsonObject result = new JsonObject();
        CloseableHttpClient httpClient = HttpClients.createDefault();
        CloseableHttpResponse response;
        // URI uri = new URIBuilder();
        if(args.has("__ow_method")){
            String url = "http://localhost:" + port + args.get("__ow_path").getAsString();
            if(args.get("__ow_query").getAsString().length() > 0){
                url += "?" + args.get("__ow_query").getAsString();
            }
            String headers = new Gson().toJson(args.getAsJsonObject("__ow_headers"));
            String body = args.get("__ow_body").getAsString();
            if(body.length() > 0){
                // body exists
                if(Base64.isBase64(body.getBytes())){
                    body = new String(Base64.decodeBase64(body));
                }
            }

            switch (args.get("__ow_method").getAsString()){
                case "get":
                {
                    HttpGet request = new HttpGet(url);
                    setHeaders(request, headers);
                    response = httpClient.execute(request);
                    break;
                }
                case "post":
                {
                    HttpPost request = new HttpPost(url);
                    setHeaders(request, headers);
                    request.setEntity(new StringEntity(body));
                    response = httpClient.execute(request);
                    System.out.println(response);
                    break;
                }
                default:
                    result.addProperty("body", "No method is found!");
                    return result;
            }
            setHeaders(result, response);
            result.addProperty("body", EntityUtils.toString(response.getEntity(), Charsets.UTF_8));
            result.addProperty("statusCode", response.getStatusLine().getStatusCode());

            response.close();
            httpClient.close();
//            Spark.stop(); // zevin: a bug in openwhisk: the thread is not cleared and isolated
            return result;
        }
        else{
            result.addProperty("body", "No method is found!");
            return result;
        }
    }

    private static void setHeaders(HttpRequestBase request, String headers){
        // Dependency bug with: JsonObject.keySet() 
        //      compile passed while no method found when running.
        try {
            JSONParser parser = new JSONParser();
            JSONObject jsonObject = (JSONObject) parser.parse(headers);
            for(Object key : jsonObject.keySet()){
                request.setHeader(String.valueOf(key), String.valueOf(jsonObject.get(key)));
            }
        } catch (ParseException e) {
            System.out.println("ParseError!");
            e.printStackTrace();
        }
    }

    private static void setHeaders(JsonObject result, CloseableHttpResponse response){
        JsonObject headers = new JsonObject();

        for(Header h : response.getAllHeaders()){
            headers.addProperty(h.getName(), h.getValue());
        }

        result.add("headers", headers);
    }

    public static void main(String[] args) {
        // Get ENV configuration values
        // Get ENV configuration values
        // CART_URL = String.format("http://%s/shipping/", System.getenv("CART_ENDPOINT") != null ? System.getenv("CART_ENDPOINT") : "cart");
        CART_URL = "https://172.17.0.1/api/v1/web/guest/robotshop/cart/shipping/";
        // JDBC_URL = String.format("jdbc:mysql://%s/cities?useSSL=false&autoReconnect=true", System.getenv("DB_HOST") != null ? System.getenv("DB_HOST") : "mysql");
        JDBC_URL = "jdbc:mysql://172.18.0.1:3306/cities?useSSL=false&autoReconnect=true";

        //
        // Create database connector
        // TODO - might need a retry loop here
        //
        try {
            cpds = new ComboPooledDataSource();
            cpds.setDriverClass( "com.mysql.jdbc.Driver" ); //loads the jdbc driver            
            cpds.setJdbcUrl( JDBC_URL );
            cpds.setUser("shipping");                                  
            cpds.setPassword("secret");
            // some config
            cpds.setMinPoolSize(5);
            cpds.setAcquireIncrement(5);
            cpds.setMaxPoolSize(20);
            cpds.setMaxStatements(180);
        }
        catch(Exception e) {
            logger.error("Database Exception", e);
        }

        // Spark
        Spark.port(port);

        Spark.get("/health", (req, res) -> "OK");

        Spark.get("/count", (req, res) -> {
            String data;
            try {
                data = queryToJson("select count(*) as count from cities");
                res.header("Content-Type", "application/json");
            } catch(Exception e) {
                logger.error("count", e);
                res.status(500);
                data = "ERROR";
            }

            return data;
        });

        Spark.get("/codes", (req, res) -> {
            String data;
            try {
                String query = "select code, name from codes order by name asc";
                data = queryToJson(query);
                res.header("Content-Type", "application/json");
            } catch(Exception e) {
                logger.error("codes", e);
                res.status(500);
                data = "ERROR";
            }

            return data;
        });

        // needed for load gen script
        Spark.get("/cities/:code", (req, res) -> {
            String data;
            try {
                String query = "select uuid, name from cities where country_code = ?";
                logger.info("Query " + query);
                data = queryToJson(query, req.params(":code"));
                res.header("Content-Type", "application/json");
            } catch(Exception e) {
                logger.error("cities", e);
                res.status(500);
                data = "ERROR";
            }

            return data;
        });

        Spark.get("/match/:code/:text", (req, res) -> {
            String data;
            try {
                String query = "select uuid, name from cities where country_code = ? and city like ? order by name asc limit 10";
                logger.info("Query " + query);
                data = queryToJson(query, req.params(":code"), req.params(":text") + "%");
                res.header("Content-Type", "application/json");
            } catch(Exception e) {
                logger.error("match", e);
                res.status(500);
                data = "ERROR";
            }

            return data;
        });

        Spark.get("/calc/:uuid", (req, res) -> {
            double homeLat = 51.164896;
            double homeLong = 7.068792;
            String data;

            Location location = getLocation(req.params(":uuid"));
            Ship ship = new Ship();
            if(location != null) {
                long distance = location.getDistance(homeLat, homeLong);
                // charge 0.05 Euro per km
                // try to avoid rounding errors
                double cost = Math.rint(distance * 5) / 100.0;
                ship.setDistance(distance);
                ship.setCost(cost);
                res.header("Content-Type", "application/json");
                data = new Gson().toJson(ship);
            } else {
                data = "no location";
                logger.warn(data);
                res.status(400);
            }

            return data;
        });

        Spark.post("/confirm/:id", (req, res) -> {
            logger.info("confirm " + req.params(":id") + " - " + req.body());
            String cart = addToCart(req.params(":id"), req.body());
            logger.info("new cart " + cart);

            if(cart.equals("")) {
                res.status(404);
            } else {
                res.header("Content-Type", "application/json");
            }

            return cart;
        });

        logger.info("Ready");
    }



    /**
     * Query to Json - QED
     **/
    private static String queryToJson(String query, Object ... args) {
        List<Map<String, Object>> listOfMaps = null;
        try {
            QueryRunner queryRunner = new QueryRunner(cpds);
            listOfMaps = queryRunner.query(query, new MapListHandler(), args);
        } catch (SQLException se) {
            throw new RuntimeException("Couldn't query the database.", se);
        }

        return new Gson().toJson(listOfMaps);
    }

    /**
     * Special case for location, dont want Json
     **/
    private static Location getLocation(String uuid) {
        Location location = null;
        Connection conn = null;
        PreparedStatement stmt = null;
        ResultSet rs = null;
        String query = "select latitude, longitude from cities where uuid = ?";

        try {
            conn = cpds.getConnection();
            stmt = conn.prepareStatement(query);
            stmt.setInt(1, Integer.parseInt(uuid));
            rs = stmt.executeQuery();
            while(rs.next()) {
                location = new Location(rs.getDouble(1), rs.getDouble(2));
                break;
            }
        } catch(Exception e) {
            logger.error("Location exception", e);
        } finally {
            DbUtils.closeQuietly(conn, stmt, rs);
        }

        return location;
    }

    private static String addToCart(String id, String data) {
        StringBuilder buffer = new StringBuilder();

        DefaultHttpClient httpClient = null;
        try {
            // set timeout to 5 secs
            HttpParams httpParams = new BasicHttpParams();
            HttpConnectionParams.setConnectionTimeout(httpParams, 5000);

            httpClient = new DefaultHttpClient(httpParams);

            // zevin
            SSLContext ssl_ctx = SSLContext.getInstance("TLS");
            TrustManager[] certs = new TrustManager[] { new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() {
                    return null;
                }
         
                public void checkClientTrusted(X509Certificate[] certs, String t) {
                }
         
                public void checkServerTrusted(X509Certificate[] certs, String t) {
                }
            } };
            ssl_ctx.init(null, certs, new SecureRandom());
            SSLSocketFactory ssf = new SSLSocketFactory(ssl_ctx, SSLSocketFactory.ALLOW_ALL_HOSTNAME_VERIFIER);
            ClientConnectionManager ccm = httpClient.getConnectionManager();
            SchemeRegistry sr = ccm.getSchemeRegistry();
            sr.register(new Scheme("https", 443, ssf));

            httpClient = new DefaultHttpClient(ccm, httpClient.getParams());

            HttpPost postRequest = new HttpPost(CART_URL + id);
            StringEntity payload = new StringEntity(data);
            payload.setContentType("application/json");
            postRequest.setEntity(payload);

            HttpResponse res = httpClient.execute(postRequest);

            if(res.getStatusLine().getStatusCode() == 200) {
                BufferedReader in = new BufferedReader(new InputStreamReader(res.getEntity().getContent()));
                String line;
                while((line = in.readLine()) != null) {
                    buffer.append(line);
                }
            } else {
                logger.warn("Failed with code: " + res.getStatusLine().getStatusCode());
            }
        } catch(Exception e) {
            logger.error("http client exception", e);
        } finally {
            if(httpClient != null) {
                httpClient.getConnectionManager().shutdown();
            }
        }

        return buffer.toString();
    }
}

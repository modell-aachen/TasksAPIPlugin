<script>
/*global foswiki*/
export default {
    methods: {
        maketext : function(text) {
            return foswiki.jsi18n.get('TaskGrid', text);
        }
    }
};
</script>
